/**
 * Serialise structured data for a `<script type="application/ld+json">` body.
 *
 * `JSON.stringify` escapes what JSON needs escaped, but an HTML parser stops a
 * script block at the first literal `</script` regardless of JSON quoting â€” so
 * a string containing that sequence ends the script early and everything after
 * it is parsed as markup. Escaping `<` as `<` is still valid JSON, decodes
 * to the same string, and leaves the parser nothing to latch onto.
 *
 * Every object below is currently author-written constants, so nothing can
 * carry that sequence today. This exists so that stays true when someone
 * eventually interpolates an event description or a source name â€” which is the
 * obvious next change to this file, and the point at which unescaped output
 * becomes stored XSS sourced from a news article.
 */
export function ldJson(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export default function JsonLd() {
  const siteUrl = "https://warlibrary.midatlantic.ai";

  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "War Library",
    url: siteUrl,
    logo: `${siteUrl}/icons/icon-512.png`,
    description:
      "An open-source, real-time conflict tracker providing verified, source-attributed reporting on the 2026 US-Israel war on Iran.",
    sameAs: ["https://github.com/midatlanticAI/WarLibrary"],
    foundingDate: "2026-02-28",
  };

  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "War Library",
    url: siteUrl,
    description:
      "Live conflict tracker mapping every verified event of the 2026 Iran war with AI-powered analysis.",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteUrl}/?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  const dataset = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "War Library Conflict Events Dataset",
    description:
      "A continuously-updated, machine-readable dataset of verified conflict events from the 2026 US-Israel military operation against Iran (Operation Epic Fury). Includes airstrikes, missile attacks, drone strikes, battles, explosions, strategic developments, and civilian impact data with geolocation, source attribution, and confidence scoring.",
    url: `${siteUrl}/api/events`,
    license: "https://opensource.org/licenses/MIT",
    creator: organization,
    temporalCoverage: "2026-02-28/..",
    spatialCoverage: {
      "@type": "Place",
      name: "Middle East",
      geo: {
        "@type": "GeoShape",
        box: "12.0 24.0 42.0 63.0",
      },
    },
    distribution: {
      "@type": "DataDownload",
      encodingFormat: "application/json",
      contentUrl: `${siteUrl}/api/events`,
    },
    variableMeasured: [
      "Event type",
      "Geolocation (latitude/longitude)",
      "Date/time",
      "Fatalities",
      "Country",
      "Source attribution",
      "Confidence score",
      "Verification status",
    ],
    keywords: [
      "conflict data",
      "war tracker",
      "Iran war 2026",
      "Operation Epic Fury",
      "military events",
      "airstrike data",
      "missile attacks",
      "OSINT",
      "open source intelligence",
      "humanitarian data",
    ],
    isAccessibleForFree: true,
  };

  const newsMedia = {
    "@context": "https://schema.org",
    "@type": "NewsMediaOrganization",
    name: "War Library",
    url: siteUrl,
    actionableFeedbackPolicy: `${siteUrl}/about`,
    correctionsPolicy: `${siteUrl}/about`,
    diversityPolicy: `${siteUrl}/about`,
    ethicsPolicy: `${siteUrl}/about`,
    masthead: `${siteUrl}/about`,
    missionCoveragePrioritiesPolicy: `${siteUrl}/about`,
    noBylinesPolicy: `${siteUrl}/about`,
    unnamedSourcesPolicy: `${siteUrl}/about`,
    verificationFactCheckingPolicy: `${siteUrl}/sources`,
    publishingPrinciples:
      "All events are source-verified from multiple tier-1 and tier-2 news outlets including Al Jazeera, BBC, Reuters, CNN, and AP. Each event includes source attribution, confidence scoring, and verification status.",
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: ldJson(organization) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: ldJson(website) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: ldJson(dataset) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: ldJson(newsMedia) }}
      />
    </>
  );
}
