import type { ConflictEvent } from "@/types";
import type { Locale } from "@/i18n";

const SITE_URL = "https://warlibrary.midatlantic.ai";

// The share text is composed for whichever language the reader is currently
// using. `locale` defaults to English so callers that have no i18n context
// (and the SSR/no-provider path) keep their previous output exactly.
export function formatEventShareText(
  event: ConflictEvent,
  locale: Locale = "en"
): string {
  const type = event.event_type.replace(/_/g, " ");
  const location = `${event.region}, ${event.country}`;
  const date = new Date(event.date).toLocaleDateString(locale, {
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

export async function shareEvent(
  event: ConflictEvent,
  locale: Locale = "en"
): Promise<void> {
  const text = formatEventShareText(event, locale);

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
