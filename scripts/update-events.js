#!/usr/bin/env node

/**
 * War Library - Automated Event Update Script
 *
 * Fetches REAL news articles from free sources (GDELT API, Google News RSS),
 * then uses Claude Haiku 4.5 to EXTRACT structured events from those articles.
 *
 * No fabricated events — every event must trace back to a real article URL.
 *
 * Usage:
 *   node scripts/update-events.js
 *
 * Environment:
 *   ANTHROPIC_API_KEY - loaded from .env.local
 */

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Resolve project root (works whether invoked from project root or scripts/)
// ---------------------------------------------------------------------------
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(PROJECT_ROOT, "src", "data");
const ENV_FILE = path.join(PROJECT_ROOT, ".env.local");

// ---------------------------------------------------------------------------
// Load .env.local manually (no extra dependency)
// ---------------------------------------------------------------------------
function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnv(ENV_FILE);

// ---------------------------------------------------------------------------
// Validate API key
// ---------------------------------------------------------------------------
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error(
    "ERROR: ANTHROPIC_API_KEY not found. Ensure it is set in .env.local or the environment."
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Anthropic SDK
// ---------------------------------------------------------------------------
const Anthropic = require("@anthropic-ai/sdk");
const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const MODEL = "claude-haiku-4-5-20251001";

// ---------------------------------------------------------------------------
// Valid event types
// ---------------------------------------------------------------------------
const VALID_EVENT_TYPES = [
  "airstrike",
  "missile_attack",
  "drone_attack",
  "battle",
  "explosion",
  "violence_against_civilians",
  "strategic_development",
  "protest",
];

// ---------------------------------------------------------------------------
// News Source Fetchers
// ---------------------------------------------------------------------------

/**
 * Fetch articles from GDELT API (free, no key needed).
 * Returns array of { title, url, source, date, description }.
 */
async function fetchGDELT() {
  const queries = [
    "iran%20war%20airstrike%20OR%20missile%20OR%20strike%20OR%20military",
    "operation%20epic%20fury%20iran",
    "iran%20israel%20hezbollah%20houthi%20conflict%202026",
    "strait%20hormuz%20OR%20iranian%20military%20OR%20IRGC",
  ];

  const allArticles = [];

  for (const q of queries) {
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&maxrecords=30&format=json&timespan=24h`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "WarLibrary/1.0 (conflict-tracker)" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        console.warn(`  GDELT query returned ${res.status} for: ${q.slice(0, 40)}...`);
        continue;
      }
      const data = await res.json();
      const articles = data.articles || [];
      for (const art of articles) {
        allArticles.push({
          title: art.title || "",
          url: art.url || "",
          source: art.domain || extractSourceFromUrl(art.url || ""),
          date: art.seendate || "",
          description: art.title || "",
        });
      }
    } catch (err) {
      console.warn(`  GDELT fetch failed for query "${q.slice(0, 30)}...": ${err.message}`);
    }
  }

  // Deduplicate by URL
  const seen = new Set();
  const unique = [];
  for (const art of allArticles) {
    if (!art.url || seen.has(art.url)) continue;
    seen.add(art.url);
    unique.push(art);
  }

  return unique;
}

/**
 * Fetch articles from Google News RSS (free, no key needed).
 * Parses RSS XML with simple regex — no xml2js dependency.
 * Returns array of { title, url, source, date, description }.
 */
async function fetchGoogleNewsRSS() {
  const feeds = [
    "https://news.google.com/rss/search?q=iran+war+operation+epic+fury+2026&hl=en-US&gl=US&ceid=US:en",
    "https://news.google.com/rss/search?q=iran+airstrike+missile+2026&hl=en-US&gl=US&ceid=US:en",
    "https://news.google.com/rss/search?q=hezbollah+houthi+iran+war+2026&hl=en-US&gl=US&ceid=US:en",
  ];

  const allArticles = [];

  for (const feedUrl of feeds) {
    try {
      const res = await fetch(feedUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; WarLibrary/1.0)",
          Accept: "application/rss+xml, application/xml, text/xml",
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        console.warn(`  Google News RSS returned ${res.status}`);
        continue;
      }
      const xml = await res.text();
      const items = parseRSSItems(xml);
      for (const item of items) {
        allArticles.push(item);
      }
    } catch (err) {
      console.warn(`  Google News RSS fetch failed: ${err.message}`);
    }
  }

  // Deduplicate by URL
  const seen = new Set();
  const unique = [];
  for (const art of allArticles) {
    if (!art.url || seen.has(art.url)) continue;
    seen.add(art.url);
    unique.push(art);
  }

  return unique;
}

/**
 * Fetch from specific outlet RSS feeds (free, no key needed).
 */
async function fetchOutletRSS() {
  const feeds = [
    {
      url: "https://www.aljazeera.com/xml/rss/all.xml",
      name: "Al Jazeera",
    },
    {
      url: "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml",
      name: "BBC News",
    },
    {
      url: "https://rss.nytimes.com/services/xml/rss/nyt/MiddleEast.xml",
      name: "New York Times",
    },
    {
      url: "http://feeds.reuters.com/Reuters/worldNews",
      name: "Reuters",
    },
  ];

  const allArticles = [];

  for (const feed of feeds) {
    try {
      const res = await fetch(feed.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; WarLibrary/1.0)",
          Accept: "application/rss+xml, application/xml, text/xml",
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        console.warn(`  ${feed.name} RSS returned ${res.status}`);
        continue;
      }
      const xml = await res.text();
      const items = parseRSSItems(xml);
      // Filter for Iran/war-related articles only
      const relevant = items.filter((item) => {
        const text = `${item.title} ${item.description}`.toLowerCase();
        return (
          text.includes("iran") ||
          text.includes("tehran") ||
          text.includes("hezbollah") ||
          text.includes("houthi") ||
          text.includes("hormuz") ||
          text.includes("irgc") ||
          text.includes("epic fury") ||
          (text.includes("strike") && (text.includes("middle east") || text.includes("israel"))) ||
          (text.includes("missile") && (text.includes("israel") || text.includes("gulf")))
        );
      });
      for (const item of relevant) {
        item.source = feed.name;
        allArticles.push(item);
      }
    } catch (err) {
      console.warn(`  ${feed.name} RSS fetch failed: ${err.message}`);
    }
  }

  return allArticles;
}

// ---------------------------------------------------------------------------
// RSS XML Parser (simple regex, no dependencies)
// ---------------------------------------------------------------------------

/**
 * Parse RSS XML into an array of { title, url, source, date, description }.
 * Uses simple regex — handles standard RSS 2.0 <item> elements.
 */
function parseRSSItems(xml) {
  const items = [];
  // Match each <item>...</item> block
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    const pubDate = extractTag(block, "pubDate");
    const description = extractTag(block, "description");
    const source = extractTag(block, "source") || extractSourceFromUrl(link);

    if (title && link) {
      items.push({
        title: decodeHTMLEntities(title),
        url: link.trim(),
        source: decodeHTMLEntities(source),
        date: pubDate || "",
        description: decodeHTMLEntities(description || title),
      });
    }
  }
  return items;
}

/**
 * Extract text content of an XML tag. Handles CDATA.
 */
function extractTag(xml, tagName) {
  // Try with CDATA first
  const cdataRegex = new RegExp(
    `<${tagName}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tagName}>`,
    "i"
  );
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1].trim();

  // Try plain text content
  const plainRegex = new RegExp(
    `<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`,
    "i"
  );
  const plainMatch = xml.match(plainRegex);
  if (plainMatch) return plainMatch[1].trim();

  return "";
}

/**
 * Decode basic HTML entities.
 */
function decodeHTMLEntities(str) {
  if (!str) return "";
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/<[^>]*>/g, ""); // Strip any remaining HTML tags
}

/**
 * Extract a human-readable source name from a URL.
 */
function extractSourceFromUrl(url) {
  if (!url) return "Unknown";
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    // Map common domains to outlet names
    const domainMap = {
      "aljazeera.com": "Al Jazeera",
      "bbc.com": "BBC News",
      "bbc.co.uk": "BBC News",
      "cnn.com": "CNN",
      "reuters.com": "Reuters",
      "nytimes.com": "New York Times",
      "washingtonpost.com": "Washington Post",
      "apnews.com": "AP News",
      "npr.org": "NPR",
      "france24.com": "France 24",
      "timesofisrael.com": "Times of Israel",
      "axios.com": "Axios",
      "theguardian.com": "The Guardian",
      "pbs.org": "PBS",
      "nbcnews.com": "NBC News",
      "abcnews.go.com": "ABC News",
      "foxnews.com": "Fox News",
      "sky.com": "Sky News",
      "news.sky.com": "Sky News",
      "dw.com": "DW News",
      "news.un.org": "UN News",
    };
    return domainMap[hostname] || hostname;
  } catch {
    return "Unknown";
  }
}

// ---------------------------------------------------------------------------
// Helpers (dedup, validation — kept from original)
// ---------------------------------------------------------------------------

function readJSON(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`WARN: ${filePath} not found, returning empty array.`);
    return [];
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  try {
    return JSON.parse(raw);
  } catch {
    console.warn(`WARN: Failed to parse ${filePath}, returning empty array.`);
    return [];
  }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Simple similarity check between two strings.
 * Returns a ratio between 0 and 1 (1 = identical).
 */
function similarity(a, b) {
  if (!a || !b) return 0;
  const al = a.toLowerCase().trim();
  const bl = b.toLowerCase().trim();
  if (al === bl) return 1;

  // Jaccard similarity on word sets
  const setA = new Set(al.split(/\s+/));
  const setB = new Set(bl.split(/\s+/));
  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Check if a candidate event is a duplicate of any existing event.
 * Uses description similarity (threshold 0.7) and exact date+country match.
 */
function isDuplicate(candidate, existingEvents) {
  for (const existing of existingEvents) {
    // Exact description match
    if (
      candidate.description &&
      existing.description &&
      candidate.description.toLowerCase().trim() ===
        existing.description.toLowerCase().trim()
    ) {
      return true;
    }
    // High similarity + same date + same country
    if (
      candidate.date === existing.date &&
      candidate.country === existing.country &&
      similarity(candidate.description, existing.description) > 0.7
    ) {
      return true;
    }
    // Same source_url
    if (
      candidate.source_url &&
      existing.source_url &&
      candidate.source_url === existing.source_url
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Validate that an event object has the required schema fields.
 */
function isValidEvent(event) {
  const requiredFields = [
    "date",
    "event_type",
    "description",
    "latitude",
    "longitude",
    "country",
    "source_url",
  ];
  for (const field of requiredFields) {
    if (event[field] === undefined || event[field] === null || event[field] === "")
      return false;
  }
  // Date should look like a date string
  if (!/^\d{4}-\d{2}-\d{2}/.test(event.date)) return false;
  // Lat/lng should be numbers
  if (typeof event.latitude !== "number" || typeof event.longitude !== "number")
    return false;
  // event_type must be valid
  if (!VALID_EVENT_TYPES.includes(event.event_type)) return false;
  // source_url must look like a URL
  if (!event.source_url.startsWith("http")) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== War Library Event Update ===");
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Data dir: ${DATA_DIR}`);

  // 1. Read existing events from all 3 files
  const eventsFile = path.join(DATA_DIR, "events.json");
  const expandedFile = path.join(DATA_DIR, "events_expanded.json");
  const latestFile = path.join(DATA_DIR, "events_latest.json");

  const eventsRaw = readJSON(eventsFile);
  const expandedRaw = readJSON(expandedFile);
  const latestRaw = readJSON(latestFile);

  // Extract .events array from each file (they wrap in { events: [...] })
  const events = Array.isArray(eventsRaw)
    ? eventsRaw
    : eventsRaw.events || [];
  const eventsExpanded = Array.isArray(expandedRaw)
    ? expandedRaw
    : expandedRaw.events || [];
  const eventsLatest = Array.isArray(latestRaw)
    ? latestRaw
    : latestRaw.events || [];

  // Combine all events for deduplication
  const allEvents = [...events, ...eventsExpanded, ...eventsLatest];
  console.log(
    `Existing events: ${events.length} (base) + ${eventsExpanded.length} (expanded) + ${eventsLatest.length} (latest) = ${allEvents.length} total`
  );

  // 2. Fetch real news articles from multiple sources
  console.log("\n--- Fetching news articles ---");

  console.log("Fetching from GDELT API...");
  const gdeltArticles = await fetchGDELT();
  console.log(`  GDELT: ${gdeltArticles.length} articles`);

  console.log("Fetching from Google News RSS...");
  const googleArticles = await fetchGoogleNewsRSS();
  console.log(`  Google News: ${googleArticles.length} articles`);

  console.log("Fetching from outlet RSS feeds...");
  const outletArticles = await fetchOutletRSS();
  console.log(`  Outlet RSS: ${outletArticles.length} articles`);

  // Combine all articles, deduplicate by URL
  const allArticlesRaw = [...gdeltArticles, ...googleArticles, ...outletArticles];
  const seenUrls = new Set();
  const allArticles = [];
  for (const art of allArticlesRaw) {
    if (!art.url || seenUrls.has(art.url)) continue;
    seenUrls.add(art.url);
    allArticles.push(art);
  }

  console.log(`\nTotal unique articles fetched: ${allArticles.length}`);

  if (allArticles.length === 0) {
    console.log("WARNING: No articles fetched from any source. All sources may be down.");
    console.log("STATUS: NO_NEW_EVENTS");
    process.exit(0);
  }

  // 3. Prepare article summaries for Claude (limit to avoid token bloat)
  const maxArticles = 75;
  const articlesToProcess = allArticles.slice(0, maxArticles);

  const articleSummaries = articlesToProcess
    .map(
      (art, i) =>
        `[${i + 1}] Title: ${art.title}\n    URL: ${art.url}\n    Source: ${art.source}\n    Date: ${art.date}\n    Description: ${(art.description || "").slice(0, 200)}`
    )
    .join("\n\n");

  // 4. Get the last 20 events as context for dedup
  const sortedEvents = [...allEvents].sort((a, b) => {
    const da = a.date || "";
    const db = b.date || "";
    return db.localeCompare(da);
  });
  const recentEvents = sortedEvents.slice(0, 20);

  // 5. Build the extraction prompt
  const schemaExample = {
    date: "2026-03-09T00:00:00Z",
    event_type: "airstrike",
    description:
      "US Air Force conducted strikes on IRGC missile storage facilities near Isfahan, destroying multiple underground bunkers according to CENTCOM.",
    latitude: 32.65,
    longitude: 51.68,
    country: "Iran",
    region: "Isfahan",
    actors: ["US Air Force", "IRGC"],
    fatalities: 0,
    source: "Al Jazeera",
    source_url: "https://www.aljazeera.com/news/2026/3/9/example-article",
    confidence: 0.9,
    verification_status: "verified",
  };

  const prompt = `You are a conflict data analyst for War Library, a neutral conflict tracker.

Your job is to EXTRACT real conflict events from the news articles provided below.
Do NOT invent or fabricate any events. Only extract events that are clearly described in the articles.

SCOPE: ONLY events related to the 2026 US-Israel war on Iran (Operation Epic Fury), including:
- US/Israeli strikes on Iran
- Iranian retaliatory strikes on Israel, Gulf states, US bases
- Hezbollah-Israel fighting in Lebanon
- Houthi activity related to this war
- Strait of Hormuz/shipping disruptions
- Diplomatic developments (UN, ceasefire talks)
- Humanitarian impact (displacement, civilian casualties)
- Protests related to this conflict
- NATO/European military deployments in response

RULES:
1. ONLY extract events that are clearly described in the articles below
2. Each event MUST have source_url set to the actual article URL it came from
3. Each event MUST have source set to the outlet name
4. Do NOT duplicate events already in our database (recent events listed below)
5. event_type MUST be one of: "airstrike", "missile_attack", "drone_attack", "battle", "explosion", "violence_against_civilians", "strategic_development", "protest"
6. Use real geographic coordinates for the location mentioned in the article
7. actors must be a JSON array of strings
8. If an article does not describe a specific conflict event, SKIP it
9. Return ONLY a valid JSON array — no markdown, no code fences, no explanation
10. Assign a "confidence" score (0.0 to 1.0) to each event based on source reliability and corroboration
11. Assign a "verification_status" to each event:
    - "verified" = event confirmed by 2+ major outlets or an official government/military source
    - "multi-source" = reported by multiple sources but key details (casualties, scope) vary
    - "unconfirmed" = single source or unverified claim

JSON SCHEMA (every event must match this exactly):
${JSON.stringify(schemaExample, null, 2)}

EXISTING RECENT EVENTS (do NOT duplicate these):
${JSON.stringify(recentEvents.map((e) => ({ date: e.date, country: e.country, description: e.description })), null, 2)}

NEWS ARTICLES TO EXTRACT FROM:
${articleSummaries}

Extract all conflict events from these articles. If no articles contain relevant conflict events, return an empty array []. Return ONLY a JSON array.`;

  // 6. Call Claude for extraction
  console.log("\nCalling Claude Haiku 4.5 to extract events from articles...");

  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });
  } catch (err) {
    console.error("ERROR calling Anthropic API:", err.message);
    process.exit(1);
  }

  const rawText =
    response.content &&
    response.content[0] &&
    response.content[0].type === "text"
      ? response.content[0].text
      : "";

  if (!rawText) {
    console.error("ERROR: Empty response from Claude.");
    process.exit(1);
  }

  // 7. Parse the response
  let newEvents;
  try {
    // Try direct parse first
    newEvents = JSON.parse(rawText);
  } catch {
    // Try extracting JSON array from the response
    const match = rawText.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        newEvents = JSON.parse(match[0]);
      } catch {
        console.error("ERROR: Could not parse JSON from Claude response.");
        console.error("Raw response:", rawText.slice(0, 500));
        process.exit(1);
      }
    } else {
      console.error("ERROR: No JSON array found in Claude response.");
      console.error("Raw response:", rawText.slice(0, 500));
      process.exit(1);
    }
  }

  if (!Array.isArray(newEvents)) {
    console.error("ERROR: Response is not an array.");
    process.exit(1);
  }

  console.log(`Claude extracted ${newEvents.length} candidate events from articles.`);

  // 8. Normalize source fields — ensure source_url is present and source is a name
  for (const event of newEvents) {
    // If source is a URL-like domain, map it to a name
    if (event.source && !event.source.includes(" ")) {
      event.source = extractSourceFromUrl(`https://${event.source}`);
    }
    // Ensure source_url is set from the article
    if (!event.source_url && event.url) {
      event.source_url = event.url;
      delete event.url;
    }
  }

  // 8b. Default confidence and verification_status if missing
  const VALID_VERIFICATION_STATUSES = ["verified", "multi-source", "unconfirmed"];
  for (const event of newEvents) {
    if (typeof event.confidence !== "number" || event.confidence < 0 || event.confidence > 1) {
      event.confidence = 0.5;
    }
    if (!VALID_VERIFICATION_STATUSES.includes(event.verification_status)) {
      event.verification_status = "unconfirmed";
    }
  }

  // 9. Validate and deduplicate
  const validEvents = newEvents.filter((e) => {
    if (!isValidEvent(e)) {
      console.log(
        `  SKIP (invalid schema): ${e.description?.slice(0, 60) || "no description"}...`
      );
      return false;
    }
    return true;
  });

  const uniqueEvents = validEvents.filter((e) => {
    if (isDuplicate(e, allEvents)) {
      console.log(`  SKIP (duplicate): ${e.description?.slice(0, 60)}...`);
      return false;
    }
    return true;
  });

  console.log(
    `After validation: ${validEvents.length} valid, ${uniqueEvents.length} unique new events.`
  );

  // 10. Append to events_latest.json
  if (uniqueEvents.length === 0) {
    console.log("No new events to add.");
    console.log("STATUS: NO_NEW_EVENTS");
    process.exit(0);
  }

  const updatedLatest = [...eventsLatest, ...uniqueEvents];
  const latestWrapper = {
    events: updatedLatest,
    metadata: {
      generated: new Date().toISOString().split("T")[0],
      source: "multiple",
      note: `Auto-updated from real news sources. ${updatedLatest.length} total events in latest file.`,
      sources_checked: ["GDELT API", "Google News RSS", "Al Jazeera RSS", "BBC RSS", "NYT RSS", "Reuters RSS"],
    },
  };
  writeJSON(latestFile, latestWrapper);

  console.log(
    `\nAdded ${uniqueEvents.length} new events to events_latest.json (total: ${updatedLatest.length}).`
  );
  console.log("\nNew events added:");
  for (const e of uniqueEvents) {
    console.log(
      `  [${e.date}] ${e.country} - ${e.event_type}: ${e.description?.slice(0, 80)}`
    );
    console.log(`    Source: ${e.source} — ${e.source_url}`);
  }
  console.log(`\nSTATUS: EVENTS_ADDED=${uniqueEvents.length}`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
