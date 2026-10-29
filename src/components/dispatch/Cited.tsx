import Link from "next/link";
import { CITATION_RE } from "@/lib/dispatch-core.cjs";

/**
 * Render dispatch prose with its `[ev:id]` citations turned into numbered
 * links to the event pages. `index` maps an event id to its number in the
 * dispatch's "events cited" list, so the same event gets the same number
 * everywhere on the page.
 */
export default function Cited({ text, index }: { text: string; index: Record<string, number> }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  const re = new RegExp(CITATION_RE.source, "g");
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    const before = text.slice(last, start).replace(/\s+$/, "");
    if (before) parts.push(before);
    const id = m[1];
    const n = index[id];
    parts.push(
      <sup key={`${id}-${i++}`} className="ms-0.5 text-[0.7em]">
        <Link href={`/event/${id}`} className="text-zinc-400 underline-offset-2 hover:text-zinc-100 hover:underline" title={`Event ${id}`}>
          {n ?? "↗"}
        </Link>
      </sup>
    );
    last = start + m[0].length;
  }
  const tail = text.slice(last);
  if (tail) parts.push(tail);
  return <>{parts}</>;
}
