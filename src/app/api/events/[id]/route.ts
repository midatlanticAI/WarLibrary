import { NextRequest, NextResponse } from "next/server";
import { getDataset, getEventById, getRelatedEvents } from "@/lib/event-store";

/**
 * GET /api/events/:id — one event by its stable content id, plus the events
 * nearest to it in place and time. Backs the event permalink's "open on map"
 * flow and any client that holds only an id.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!/^[0-9a-f]{12}(-\d+)?$/.test(id)) {
    return NextResponse.json({ error: "Malformed event id." }, { status: 400 });
  }
  const event = getEventById(id);
  if (!event) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }
  return NextResponse.json(
    {
      data: event,
      related: getRelatedEvents(event, 8),
      meta: { last_updated: getDataset().lastUpdated },
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      },
    }
  );
}
