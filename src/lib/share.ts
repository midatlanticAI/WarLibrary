import type { ConflictEvent } from "@/types";

const SITE_URL = "https://warlibrary.midatlantic.ai";

export function formatEventShareText(event: ConflictEvent): string {
  const type = event.event_type.replace(/_/g, " ");
  const location = `${event.region}, ${event.country}`;
  const date = new Date(event.date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const fatalities =
    event.fatalities && event.fatalities > 0
      ? ` — ${event.fatalities} killed`
      : "";
  const source = event.source ? ` (${event.source})` : "";

  return `${type.toUpperCase()}: ${location}${fatalities}\n${event.description}${source}\n${date}\n\n${SITE_URL}`;
}

export async function shareEvent(event: ConflictEvent): Promise<void> {
  const text = formatEventShareText(event);

  if (navigator.share) {
    await navigator.share({
      title: `War Library — ${event.event_type.replace(/_/g, " ")}`,
      text,
      url: SITE_URL,
    });
  } else {
    await navigator.clipboard.writeText(text);
  }
}
