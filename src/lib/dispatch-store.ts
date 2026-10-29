import fs from "fs";
import path from "path";
import * as core from "@/lib/dispatch-core.cjs";
import type { Dispatch, DispatchKind } from "@/lib/dispatch-core.cjs";

/**
 * Dispatch storage: one JSON file per dispatch under
 * `src/data/dispatches/<kind>/<key>.json` on the droplet (gitignored, covered
 * by the nightly backup). The writer script creates them; the pages, feed,
 * sitemaps and admin read them through this module; admin actions update
 * them through it. Keeping every read and write behind this file is what
 * lets the Cloudflare port swap the directory for a D1 table without
 * touching a page.
 */

export const DISPATCH_DIR =
  process.env.DISPATCH_DIR || path.join(process.cwd(), "src", "data", "dispatches");

const CACHE_TTL_MS = 15_000;
let listCache: { at: number; items: Dispatch[] } | null = null;

export function invalidateDispatchCache(): void {
  listCache = null;
}

function fileFor(kind: DispatchKind, key: string): string {
  // Kind and key are validated before they are joined into a path, so a
  // request for `../../.env` can never reach the filesystem.
  if (!core.isValidKey(kind, key)) throw new Error(`Invalid dispatch ${kind}/${key}`);
  return path.join(DISPATCH_DIR, core.dispatchFileName(kind, key));
}

function parseDispatch(raw: string): Dispatch | null {
  try {
    const parsed = JSON.parse(raw) as Dispatch;
    if (!core.isKind(parsed.kind) || !core.isValidKey(parsed.kind, parsed.key)) return null;
    if (typeof parsed.title !== "string" || !Array.isArray(parsed.sections)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readDispatch(kind: DispatchKind, key: string): Dispatch | null {
  if (!core.isValidKey(kind, key)) return null;
  const file = fileFor(kind, key);
  if (!fs.existsSync(/*turbopackIgnore: true*/ file)) return null;
  try {
    return parseDispatch(fs.readFileSync(/*turbopackIgnore: true*/ file, "utf-8"));
  } catch (err) {
    console.error(`[dispatch] Failed to read ${file}:`, err);
    return null;
  }
}

/** Atomic write (tmp + rename) so a reader never sees a half-written file. */
export function writeDispatch(dispatch: Dispatch): void {
  const file = fileFor(dispatch.kind, dispatch.key);
  fs.mkdirSync(/*turbopackIgnore: true*/ path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(/*turbopackIgnore: true*/ tmp, JSON.stringify(dispatch, null, 2), "utf-8");
  fs.renameSync(/*turbopackIgnore: true*/ tmp, file);
  invalidateDispatchCache();
}

/** Every dispatch on disk, newest key first within each kind. */
export function listDispatches(kind?: DispatchKind): Dispatch[] {
  if (!listCache || Date.now() - listCache.at > CACHE_TTL_MS) {
    const items: Dispatch[] = [];
    for (const k of core.KINDS) {
      const dir = path.join(DISPATCH_DIR, k);
      if (!fs.existsSync(/*turbopackIgnore: true*/ dir)) continue;
      for (const name of fs.readdirSync(/*turbopackIgnore: true*/ dir)) {
        if (!name.endsWith(".json")) continue;
        try {
          const parsed = parseDispatch(fs.readFileSync(/*turbopackIgnore: true*/ path.join(dir, name), "utf-8"));
          if (parsed && parsed.kind === k) items.push(parsed);
        } catch (err) {
          console.error(`[dispatch] Failed to read ${name}:`, err);
        }
      }
    }
    items.sort((a, b) => b.key.localeCompare(a.key));
    listCache = { at: Date.now(), items };
  }
  const all = listCache.items;
  return kind ? all.filter((d) => d.kind === kind) : all;
}

/** Published dispatches (including drafts whose 24 h window has elapsed). */
export function publishedDispatches(kind?: DispatchKind, limit?: number): Dispatch[] {
  const now = new Date();
  const items = listDispatches(kind).filter((d) => core.isPublished(d, now));
  return limit ? items.slice(0, limit) : items;
}

export function latestPublished(kind: DispatchKind): Dispatch | null {
  return publishedDispatches(kind, 1)[0] ?? null;
}

/** Published dispatches ordered by publication time, newest first (for feeds and the news sitemap). */
export function recentlyPublished(limit: number): Dispatch[] {
  return publishedDispatches()
    .map((d) => ({ d, at: publishedAt(d) }))
    .sort((a, b) => b.at - a.at)
    .slice(0, limit)
    .map((x) => x.d);
}

/** When a dispatch became public: its explicit stamp, else its auto-publish time. */
export function publishedAt(dispatch: Dispatch): number {
  const explicit = dispatch.published_at ? new Date(dispatch.published_at).getTime() : NaN;
  if (!Number.isNaN(explicit)) return explicit;
  const auto = dispatch.publish_after ? new Date(dispatch.publish_after).getTime() : NaN;
  if (!Number.isNaN(auto)) return auto;
  return new Date(dispatch.generated_at).getTime();
}

/** Previous and next published dispatch of the same kind, for page navigation. */
export function neighbours(dispatch: Dispatch): { prev: Dispatch | null; next: Dispatch | null } {
  const items = publishedDispatches(dispatch.kind); // newest first
  const idx = items.findIndex((d) => d.key === dispatch.key);
  if (idx === -1) return { prev: null, next: null };
  return { prev: items[idx + 1] ?? null, next: items[idx - 1] ?? null };
}
