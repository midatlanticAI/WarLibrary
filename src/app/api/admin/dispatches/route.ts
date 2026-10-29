import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { openSync, closeSync } from "fs";
import { join } from "path";
import { isAdmin } from "@/lib/auth";
import { listDispatches, readDispatch, writeDispatch, invalidateDispatchCache } from "@/lib/dispatch-store";
import * as core from "@/lib/dispatch-core.cjs";
import type { Dispatch, DispatchKind } from "@/lib/dispatch-core.cjs";
import { SITE_URL } from "@/lib/site";

/**
 * Admin API for dispatches.
 *
 * GET  /api/admin/dispatches                → every dispatch, newest first (summaries)
 * GET  /api/admin/dispatches?kind=&key=     → one dispatch in full (drafts included)
 * POST { action: publish|pull|edit|regenerate|generate, kind, key, title?, lede? }
 *
 * Every state change is written through the dispatch store; the writer
 * script runs detached for regenerate/generate and the UI polls for the
 * result. Nothing here deletes a file.
 */

const WRITER = join(process.cwd(), "scripts", "write-dispatch.js");
const INDEXNOW = join(process.cwd(), "scripts", "indexnow.js");
const TRANSLATOR = join(process.cwd(), "scripts", "translate-dispatch.js");
const NEWSLETTER = join(process.cwd(), "scripts", "newsletter.js");
const LOG_PATH = "/var/log/warlibrary-dispatch.log";

/** Writer runs in flight, keyed `kind/key`, so a double click cannot start two. */
const inflight = new Map<string, number>();
const INFLIGHT_STALE_MS = 10 * 60_000;

interface Body {
  action?: string;
  kind?: string;
  key?: string;
  title?: string;
  lede?: string;
}

function summary(d: Dispatch, now: Date) {
  return {
    kind: d.kind,
    key: d.key,
    title: core.stripCitations(d.title),
    status: d.status,
    effective_status: core.effectiveStatus(d, now),
    publish_after: d.publish_after,
    published_at: d.published_at,
    needs_review: d.needs_review,
    generated_at: d.generated_at,
    edited_at: d.edited_at,
    revision: d.revision,
    sections: d.sections.length,
    cited: d.cited_ids.length,
    events: d.stats.events,
    cost_usd: d.usage.cost_usd ?? 0,
    label: d.window.label,
    url: core.dispatchUrlPath(d.kind, d.key),
    in_flight: inflight.has(`${d.kind}/${d.key}`),
    translations: Object.keys(d.translations ?? {}),
    emailed: Object.keys(d.emailed ?? {}),
  };
}

function csrfFailure(req: NextRequest): NextResponse | null {
  const origin = req.headers.get("origin");
  const secFetchSite = req.headers.get("sec-fetch-site");
  const host = req.headers.get("host");
  if (secFetchSite && secFetchSite !== "same-origin") {
    return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  }
  if (!origin) return NextResponse.json({ error: "Origin header required" }, { status: 403 });
  try {
    if (!host || new URL(origin).host !== host) {
      return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  return null;
}

/**
 * Run a script detached, output appended to the dispatch log (or dropped).
 * The 'error' listener matters: without it a failed spawn (ENOMEM on the
 * 2 GB box, a missing node binary) is an unhandled event that would bring
 * down the process serving the whole site.
 */
function runDetached(args: string[], tag?: string): void {
  let out: number | "ignore" = "ignore";
  try {
    out = openSync(LOG_PATH, "a");
  } catch {
    out = "ignore";
  }
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    detached: true,
    stdio: ["ignore", out, out],
    env: process.env,
  });
  child.on("error", (err) => {
    console.error("[dispatches] script failed to start:", err);
    if (tag) inflight.delete(tag);
  });
  child.on("exit", () => {
    if (tag) inflight.delete(tag);
    invalidateDispatchCache();
  });
  child.unref();
  if (typeof out === "number") closeSync(out);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const kind = req.nextUrl.searchParams.get("kind");
  const key = req.nextUrl.searchParams.get("key");
  const now = new Date();
  if (kind || key) {
    if (!core.isKind(kind) || !core.isValidKey(kind, key)) {
      return NextResponse.json({ error: "Invalid kind or key" }, { status: 400 });
    }
    const d = readDispatch(kind as DispatchKind, key as string);
    if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      data: { ...d, effective_status: core.effectiveStatus(d, now), social: core.socialText(d, `${SITE_URL}${core.dispatchUrlPath(d.kind, d.key)}`) },
    });
  }
  invalidateDispatchCache();
  const items = listDispatches().map((d) => summary(d, now));
  return NextResponse.json({
    data: {
      items,
      pending: items.filter((i) => i.effective_status === "draft").length,
      next_keys: {
        daily: core.defaultKey("daily", now),
        weekly: core.defaultKey("weekly", now),
        monthly: core.defaultKey("monthly", now),
      },
    },
    timestamp: now.toISOString(),
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const csrf = csrfFailure(req);
  if (csrf) return csrf;
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { action, kind, key } = body;
  if (!core.isKind(kind) || !core.isValidKey(kind, key)) {
    return NextResponse.json({ error: "Invalid kind or key" }, { status: 400 });
  }
  const k = kind as DispatchKind;
  const now = new Date();

  if (action === "generate" || action === "regenerate") {
    const tag = `${k}/${key}`;
    const started = inflight.get(tag);
    if (started && now.getTime() - started < INFLIGHT_STALE_MS) {
      return NextResponse.json({ error: `A writer for ${tag} is already running; wait for it to finish.` }, { status: 409 });
    }
    const args = [WRITER, "--kind", k, "--key", key as string];
    if (action === "regenerate") args.push("--force");
    inflight.set(tag, now.getTime());
    try {
      runDetached(args, tag);
    } catch (err) {
      inflight.delete(tag);
      return NextResponse.json({ error: `Could not start the writer: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
    }
    return NextResponse.json({ ok: true, message: `${action === "regenerate" ? "Regenerating" : "Generating"} ${k} ${key} in the background; it appears in the list in about a minute.` });
  }

  const d = readDispatch(k, key as string);
  if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "publish") {
    d.status = "published";
    d.published_at = now.toISOString();
    d.publish_after = null;
    d.pulled_at = null;
    writeDispatch(d);
    try {
      runDetached([INDEXNOW, `${SITE_URL}${core.dispatchUrlPath(k, d.key)}`, `${SITE_URL}/dispatch`]);
    } catch (err) {
      console.error("[dispatches] IndexNow ping failed to start:", err);
    }
    // Email subscribers now rather than at the next hourly sweep.
    try {
      runDetached([NEWSLETTER, "sweep"]);
    } catch (err) {
      console.error("[dispatches] newsletter sweep failed to start:", err);
    }
    return NextResponse.json({ ok: true, message: `Published ${k} ${d.key}. Subscribers are being emailed.` });
  }

  if (action === "translate") {
    try {
      runDetached([TRANSLATOR, "--kind", k, "--key", d.key, "--force"]);
    } catch (err) {
      return NextResponse.json({ error: `Could not start the translator: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
    }
    return NextResponse.json({ ok: true, message: `Translating ${k} ${d.key} into every language in the background.` });
  }

  if (action === "pull") {
    d.status = "pulled";
    d.pulled_at = now.toISOString();
    d.publish_after = null;
    writeDispatch(d);
    return NextResponse.json({ ok: true, message: `Pulled ${k} ${d.key}. The page now returns 404.` });
  }

  if (action === "edit") {
    const title = typeof body.title === "string" ? body.title.replace(/\s+/g, " ").trim().slice(0, 160) : null;
    const lede = typeof body.lede === "string" ? body.lede.trim().slice(0, 2000) : null;
    if (!title && !lede) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
    // A draft that already went live on its own is live: make that explicit
    // before touching publish_after, or the edit would take the page down.
    if (core.effectiveStatus(d, now) === "published" && d.status === "draft") {
      d.status = "published";
      d.published_at = d.published_at ?? d.publish_after;
    }
    if (title) d.title = title;
    if (lede) d.lede = lede;
    d.edited_at = now.toISOString();
    d.revision = (d.revision || 1) + 1;
    // An edited draft is "touched": it no longer auto-publishes. The operator
    // presses Publish when the edit is done.
    if (d.status === "draft") d.publish_after = null;
    // The translations were of the old title and lede. Drop them (readers
    // see English with a notice meanwhile) and re-translate in the background.
    d.translations = null;
    d.translated_at = null;
    writeDispatch(d);
    try {
      runDetached([TRANSLATOR, "--kind", k, "--key", d.key, "--force"]);
    } catch (err) {
      console.error("[dispatches] translator failed to start after edit:", err);
    }
    return NextResponse.json({ ok: true, message: `Saved ${k} ${d.key}${d.status === "draft" ? " (draft; press Publish when ready)" : ""}. Re-translating in the background.` });
  }

  return NextResponse.json({ error: `Unknown action: ${action}. Valid: publish, pull, edit, regenerate, generate, translate` }, { status: 400 });
}
