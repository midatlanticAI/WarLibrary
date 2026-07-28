# Moving War Library to Cloudflare Workers

**Status:** proposal, nothing built. Written 2026-07-28 against `master` @ `eaa43ba`.

Every platform limit quoted here was read from Cloudflare's docs on the date
above, and every number about *our* code was measured on this machine, not
estimated. Both kinds go stale; re-measure before acting on anything here.

---

## 1. Why this is worth doing

War Library is a read-heavy site serving one large dataset to a global
audience, and it currently serves all of it from a single 2GB droplet. A reader
in Tehran or Tel Aviv — which is most of the audience that matters for this
project — round-trips to one box in one datacentre. That is the case for edge
distribution in a sentence.

The secondary case is structural, and it is the more interesting one. Several
problems this project keeps hitting are only problems because the dataset lives
in a JSON file:

- `country` is free text with ~204 distinct values, of which ~73 are aggregates
  or lists. It is unnormalised because there is nothing to normalise it *to*.
- Deduplication runs as scripts that quarantine into side files, because there
  is no way to express "find near-duplicates" as a query.
- Date validation catches bad rows at ingest but cannot enforce anything about
  rows already stored.

A real database does not automatically fix these, but it makes each of them a
constraint or a query rather than a script and a JSON file. That is the actual
unlock, and it is worth more than the latency.

---

## 2. The constraint that decides the architecture

**A Worker isolate has a hard 128 MB memory limit**, shared by the JS heap and
any WebAssembly. That is the number the whole design has to answer to.

Measured on this machine against the live dataset:

```
events:              23,084
file on disk:        19.6 MB
raw string in heap:  39.3 MB   (UTF-16 in memory, ~2x the UTF-8 bytes on disk)
string + parsed:     60.5 MB   <-- peak: both alive at once during JSON.parse
heapTotal at peak:   91.3 MB
```

So a Worker that does `JSON.parse(await r2.get(...))` spends **71% of its
entire isolate budget** reproducing what the droplet does today — before any
request handling, before the response is serialised, and before the runtime's
own overhead. There is no headroom, and the dataset grows every 30 minutes.

This is not a "watch it carefully" problem. It is a hard architectural
constraint, and it eliminates the option that would otherwise be the easy one.

For contrast, the same rows projected to the six fields the map actually needs:

```
lite projection:     2.6 MB for 23,084 rows
```

Twenty-three times smaller. That gap is the entire argument for a query layer:
the cost is not the number of events, it is loading fields nobody asked for.

### Consequence: R2-as-blob is not viable

Keeping `events_latest.json` in R2 and fetching it per request is the smallest
diff and it does not work — not "is slower", does not work. It is still worth
naming because it is the obvious first idea, and the reason it fails is not
obvious until you measure it.

R2 remains the right home for **backups and the quarantine files** — write-once,
read-rarely, never parsed in a request path.

---

## 3. The hazard that will bite silently

`node:fs` **is supported** on Workers under `nodejs_compat`, which is worse than
it not being supported.

- `/bundle` is read-only.
- `/tmp` is writable — but it is **in-memory, per-request**, and it counts
  against the same 128 MB. Files written during one request are not visible to
  any other request, concurrent or later.

So this code compiles, deploys, runs, and returns 200:

```ts
writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2));
return NextResponse.json({ success: true });
```

...and the write is gone. There is no error, no warning, and the endpoint
reports success. **We have 11 such call sites across 6 files:**

```
src/app/api/admin/dashboard/route.ts
src/app/api/events/route.ts
src/app/api/push/route.ts
src/lib/analytics-store.ts
src/lib/notifications.ts
src/lib/push.ts
```

Every one is silent data loss on Workers: push subscriptions that appear to
save and vanish, analytics that always read zero, notifications that publish to
nobody.

**Therefore:** the migration cannot be "deploy it and fix what breaks," because
the most important things do not break loudly. Every one of these call sites
must be converted deliberately, and the audit for them is step zero — not a
cleanup pass at the end. This is the single highest-risk item in the whole
migration and it is entirely avoidable by knowing about it in advance.

---

## 4. Storage: D1, with R2 alongside

| Store | Holds | Why |
|---|---|---|
| **D1** (SQLite) | events, dedup state, analytics counters, push subscriptions | The read path is all filters and ranges, which is what SQL is for |
| **KV** | precomputed summary payload, the 12 Tier-1 chat answers | Read-mostly, tiny, edge-cached, tolerates eventual consistency |
| **R2** | dataset backups, quarantine files, article cache | Write-once, read-rarely, never parsed in a request |
| **Durable Object** | pipeline run lock | Replaces `flock` in `auto-update.sh` |

D1 limits (paid plan, read 2026-07-28): **10 GB per database**, 1 TB per
account, 30 s max query, 1,000 queries per Worker invocation, 2 MB max row.

Our 19.6 MB dataset uses **0.2% of a single database**. Storage is not a
consideration at this scale — which means the schema can be chosen for
correctness rather than compactness.

### Schema sketch

The 16 fields we store today, plus the constraints the JSON file cannot hold:

```sql
CREATE TABLE events (
  id                  TEXT PRIMARY KEY,      -- content hash, as the API already derives
  date                TEXT NOT NULL,         -- ISO 8601, UTC
  event_type          TEXT NOT NULL REFERENCES event_types(name),
  description         TEXT NOT NULL,
  latitude            REAL NOT NULL,
  longitude           REAL NOT NULL,
  country_raw         TEXT NOT NULL,         -- exactly as extracted, never rewritten
  country_code        TEXT REFERENCES countries(iso2),  -- nullable: unresolved is honest
  region              TEXT NOT NULL DEFAULT '',
  actors              TEXT NOT NULL DEFAULT '',
  fatalities          INTEGER NOT NULL DEFAULT 0 CHECK (fatalities >= 0),
  source              TEXT NOT NULL,
  source_url          TEXT NOT NULL,
  confidence          REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  verification_status TEXT NOT NULL,
  civilian_impact     TEXT NOT NULL DEFAULT '',
  location_precision  TEXT NOT NULL,
  needs_review        INTEGER NOT NULL DEFAULT 0,
  ingested_at         TEXT NOT NULL,

  -- The rollover bug, as a constraint the database enforces rather than a
  -- function we have to remember to call. `date(...)` returns NULL for a day
  -- that does not exist, so '2026-06-31' fails here instead of silently
  -- becoming July 1st.
  CHECK (date(substr(date, 1, 10)) IS NOT NULL),
  CHECK (substr(date, 1, 10) >= '2026-02-28')
);

CREATE INDEX idx_events_date        ON events(date);
CREATE INDEX idx_events_type_date   ON events(event_type, date);
CREATE INDEX idx_events_country     ON events(country_code, date);
CREATE INDEX idx_events_dedup_block ON events(country_code, event_type, substr(date,1,10));
```

Three deliberate choices worth defending:

1. **`country_raw` is never overwritten.** The extraction model's output is part
   of the provenance record. `country_code` is our interpretation of it, and a
   NULL there is an honest "we could not resolve this" rather than a wrong
   guess. This project publishes provenance; the schema should reflect that.
2. **The date `CHECK` is the rollover fix made structural.** `isStrictCalendarDate()`
   in `scripts/update-events.js` protects the ingest path. The constraint
   protects *every* path, including manual fixes and future importers, which is
   what we could not do before.
3. **`idx_events_dedup_block`** mirrors the blocking key the retroactive deduper
   already uses (`country | type | day`). The clustering pass becomes an indexed
   query instead of an O(n) scan over the full set.

### Migration of existing data

23,084 rows is small enough that correctness beats cleverness: export to SQL,
import with `wrangler d1 execute --file`, then re-run
`scripts/validate-pipeline.js` against the D1-backed API and require the same
11/11 it produces today. **The harness is the acceptance test for the
migration** — that is what it is for, and it is the reason this migration is
tractable at all.

Expect the import to reject rows. That is the point: four events carry dates
that do not exist, and the `CHECK` will refuse them. Those rejections are the
outstanding data decision surfacing as a hard error instead of a warning in a
report nobody reads.

---

## 5. Route-by-route

| Route | Today | On Workers | Difficulty |
|---|---|---|---|
| `/api/events` | reads + merges 3 JSON files, mtime cache, ETag | `SELECT` with the existing `from`/`to`/`limit`/`offset`/`fields` params as SQL | **Medium** — the biggest win |
| `/api/stats` | recomputes over full set | `SELECT count/sum GROUP BY`, or KV-cached | Easy |
| `/api/health` | reads file mtimes | `SELECT max(ingested_at)` | Easy |
| `/api/chat` | Anthropic SDK + RAG over events | unchanged; RAG retrieval becomes a query | Easy |
| `/api/analytics` | `writeFileSync` counters | D1 `UPSERT` | Easy |
| `/api/notifications` | writes `notification.json` | D1 row + KV for the read path | Easy |
| `/api/push` | writes `push-subscriptions.json`; `web-push` lib | D1 table; `web-push` needs replacing (Node crypto) | **Medium** |
| `/api/admin` | cookie auth, SHA-256 timing-safe | unchanged — WebCrypto is native | Easy |
| `/api/admin/dashboard` | `execFile` to `pm2` and `crontab` | **no equivalent** | **Blocked** — see §7 |

The `/api/events` work is mostly deletion. The mtime-keyed module cache, the
manual ETag computation, the three-file merge and the in-memory sort all exist
to make file-reading tolerable. Against D1 they are the database's job. The
conditional-polling contract (`If-None-Match` → 304) that `useEvents.ts` depends
on stays — it just gets its ETag from a content version column instead of file
mtimes, so **no frontend change is required.**

---

## 6. The pipeline

`scripts/update-events.js` maps onto **Cron Triggers** more cleanly than
expected:

| Concern | Limit (paid, read 2026-07-28) | Our usage | Verdict |
|---|---|---|---|
| Wall-clock | 15 min | 180 s timeout | Comfortable |
| CPU time | 5 min | API-latency dominated | Comfortable — Workers bill CPU, not waiting |
| Subrequests | 10,000 | ~30 (RSS + articles + Anthropic) | Comfortable |
| Cron triggers | 250/account | 1 | Fine |

Billing CPU rather than wall-clock genuinely favours this workload: the pipeline
spends nearly all its time waiting on Anthropic and news outlets, and we would
stop paying for a droplet to idle between 30-minute runs.

**The real blocker is `jsdom` — 12 MB unpacked**, against a 10 MB *gzipped*
Worker script limit. It cannot ship. It is used for exactly one thing: giving
`@mozilla/readability` a DOM to extract article bodies from.

Two ways out, and the second is better than the workaround it appears to be:

1. **`HTMLRewriter`** — Cloudflare's native streaming parser. Zero bundle cost,
   built for this, but it is a streaming transformer, so Readability's
   whole-document scoring has to be rewritten as extraction heuristics.
2. **Two-stage via Queues** — the cron Worker enqueues URLs, a consumer fetches
   and extracts. Same limits per invocation, but each article gets its own
   budget instead of 20 sharing one. Better isolation, better retries, and a bad
   article stops being able to poison a whole run.

The functions the validation harness covers — `isValidEvent`,
`findDuplicateMatch`, `spatialRelation`, `significantWords`,
`isStrictCalendarDate` — are **pure and portable**. They move unchanged, and the
harness keeps proving them. That is the part of this migration that carries no
risk, and it is most of the logic that matters.

---

## 7. What is genuinely blocked

**`node:child_process` is a non-functional stub on Workers.** It imports and
does nothing. The admin dashboard uses `execFile` to run `pm2 restart`, read and
rewrite `crontab`, and trigger pipeline runs. There is no edge equivalent,
because there is no server to restart and no crontab to edit.

Three options, in order of preference:

1. **Reframe the controls.** "Restart PM2" becomes meaningless; "trigger a
   pipeline run" becomes a Durable Object alarm or a queue message; "change cron
   interval" becomes a `wrangler.toml` change, i.e. a deploy. Most of the panel
   survives in a different shape, and arguably a better one — these are
   currently shell commands behind a cookie.
2. **Split the deployment.** Public site on Workers, admin stays on a small box.
   Honest, but two deployment targets forever.
3. **Drop the controls**, keep the read-only dashboard. Least work, real loss.

This needs a decision before the migration starts, because it changes the
target architecture rather than the implementation.

---

## 8. Phasing

Each phase is independently shippable and independently revertible. Do not
start a phase until the previous one is running in production.

**Phase 0 — Prove the storage layer.** No traffic. Create D1, import the 23k
events, point `scripts/validate-pipeline.js` at the D1-backed functions, require
11/11. If the harness cannot pass against D1, nothing else matters. *Also: audit
all 11 `writeFileSync` sites and write down what each becomes.*

**Phase 1 — Read path only.** Deploy the Worker serving `/api/events`,
`/api/stats`, `/api/health` from D1. Droplet still authoritative, still running
the pipeline, still writing the JSON. Worker is a read replica. Compare
responses against the droplet's for a week.

**Phase 2 — Cut over reads.** DNS to Workers for the public site. Droplet keeps
the pipeline and the admin surface. **This is where the latency win lands**, and
it is reversible with a DNS change.

**Phase 3 — Move the pipeline.** Cron Trigger + Queues, with the article
extraction rewrite. The largest single piece of work. Run both in parallel
writing to separate tables, diff the output, then retire the droplet's.

**Phase 4 — Resolve admin.** Per the §7 decision.

**Phase 5 — Retire the droplet.** Only after Phases 1–4 have each held for a
sustained period.

Phases 1 and 2 deliver most of the user-visible benefit and carry the least
risk. It is entirely reasonable to stop after Phase 2 and keep the droplet for
the pipeline and admin indefinitely — a hybrid is a legitimate destination, not
a half-finished migration.

---

## 9. Honest accounting

**Gained:** global edge reads instead of one datacentre; no server to patch,
restart or run out of disk; a query layer that makes country normalisation and
dedup tractable; date correctness enforced by the schema on every path; likely
lower cost than an always-on droplet for a bursty workload.

**Lost:** a filesystem, which is genuinely convenient for a project whose data
is a file; shell access for the admin panel; the ability to SSH in and look at
things — real operational comfort, worth naming; and `wrangler` in the loop for
work that is currently `scp` and `pm2 restart`.

**Risked:** the silent-write class in §3 is the one that could quietly corrupt
production while every endpoint returns 200. Everything else fails loudly.

**Not a reason to do this:** the app being slow. It is not. The measured
blocking compute for `/api/events` is ~0.4 s, and an earlier "12.9 s" figure was
a measurement artifact (PowerShell `Invoke-WebRequest` negotiating no
compression). Migrating for latency we have not demonstrated would be building
on the same mistake twice.

---

## 10. Decide before starting

1. **Admin controls** (§7) — reframe, split, or drop? Changes the target
   architecture.
2. **The four impossible-date events** — the D1 `CHECK` will reject them at
   import. Repair, quarantine, or relax the constraint for historical rows?
3. **Hybrid or full?** Is retiring the droplet the goal, or is Phase 2 the
   destination?
4. **`country_code` backfill** — before import, after, or never? ~204 raw values
   including ~73 aggregates; the schema allows NULL indefinitely, so this can be
   deferred without blocking anything.

---

## Sources

Cloudflare docs, read 2026-07-28:

- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) — 128 MB isolate, 10 MB gzip script, 15 min cron wall-clock, 10,000 subrequests
- [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) — 10 GB/db, 30 s query, 1,000 queries/invocation
- [Node.js compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/) — `child_process` is a stub
- [Workers `fs`](https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/) — `/tmp` is in-memory and per-request
- [OpenNext Cloudflare adapter](https://opennext.js.org/cloudflare) — Next.js 16 supported, Node runtime, ISR and route handlers
