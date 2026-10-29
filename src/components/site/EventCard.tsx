import Link from "next/link";
import type { SerializedEvent } from "@/lib/event-store";
import { EVENT_COLORS } from "@/lib/constants";
import { excerpt } from "@/lib/site";
import { formatDateFor, formatNumberFor, makeT, type Translate } from "@/i18n/server";
import type { Locale } from "@/i18n/locale";

/**
 * One event as a list row on the server-rendered pages. The page resolves
 * the locale once and passes it down; building a translator per card is
 * cheap but the lookup of cookies and headers is not.
 */
export default function EventCard({ event, locale, t }: { event: SerializedEvent; locale: Locale; t?: Translate }) {
  const tr = t ?? makeT(locale);
  const color = EVENT_COLORS[event.event_type] ?? "#71717a";
  return (
    <Link
      href={`/event/${event.id}`}
      className="block rounded-lg border border-zinc-800 bg-[#111] p-3 transition-colors hover:border-zinc-700 hover:bg-[#151515]"
    >
      <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1.5 font-medium text-zinc-300">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
          {tr(`eventTypes.${event.event_type}`)}
        </span>
        <span aria-hidden="true">·</span>
        <time dateTime={event.date}>{formatDateFor(locale, event.date)}</time>
        {event.region && event.region !== event.country && (
          <>
            <span aria-hidden="true">·</span>
            <span>{event.region}</span>
          </>
        )}
        {event.fatalities && event.fatalities > 0 ? (
          <>
            <span aria-hidden="true">·</span>
            <span className="text-red-400">{tr("pages.killedN", { n: formatNumberFor(locale, event.fatalities) })}</span>
          </>
        ) : null}
      </div>
      <p className="text-sm leading-snug text-zinc-200" lang="en">{excerpt(event.description, 220)}</p>
      <p className="mt-1 text-xs text-zinc-500">{event.source}</p>
    </Link>
  );
}
