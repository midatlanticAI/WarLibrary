import Link from "next/link";
import type { SerializedEvent } from "@/lib/event-store";
import { EVENT_COLORS } from "@/lib/constants";
import { eventTypeLabel, formatDate, excerpt, formatNumber } from "@/lib/site";

/** One event as a list row on the server-rendered pages. */
export default function EventCard({ event }: { event: SerializedEvent }) {
  const color = EVENT_COLORS[event.event_type] ?? "#71717a";
  return (
    <Link
      href={`/event/${event.id}`}
      className="block rounded-lg border border-zinc-800 bg-[#111] p-3 transition-colors hover:border-zinc-700 hover:bg-[#151515]"
    >
      <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1.5 font-medium text-zinc-300">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
          {eventTypeLabel(event.event_type)}
        </span>
        <span aria-hidden="true">·</span>
        <time dateTime={event.date}>{formatDate(event.date)}</time>
        {event.region && event.region !== event.country && (
          <>
            <span aria-hidden="true">·</span>
            <span>{event.region}</span>
          </>
        )}
        {event.fatalities && event.fatalities > 0 ? (
          <>
            <span aria-hidden="true">·</span>
            <span className="text-red-400">{formatNumber(event.fatalities)} killed</span>
          </>
        ) : null}
      </div>
      <p className="text-sm leading-snug text-zinc-200">{excerpt(event.description, 220)}</p>
      <p className="mt-1 text-xs text-zinc-500">{event.source}</p>
    </Link>
  );
}
