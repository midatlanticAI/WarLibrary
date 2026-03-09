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
const http = require("http");

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
// Source quality tiers — not all outlets carry equal weight.
// Tier 1 sources are major wire services and globally recognized outlets with
// rigorous editorial standards and multi-layer fact-checking. Tier 2 sources
// are credible regional or specialty outlets. Tier 3 is everything else —
// single-reporter blogs, unknown domains, aggregators without original reporting.
// Confidence adjustments reflect the likelihood that reporting is accurate
// and independently verifiable.
// ---------------------------------------------------------------------------
const SOURCE_TIERS = {
  // Tier 1: Major wire services and globally recognized outlets
  tier1: [
    "Reuters", "AP News", "BBC News", "Al Jazeera", "CNN",
    "New York Times", "Washington Post", "NPR", "France 24",
  ],
  // Tier 2: Credible regional/specialty outlets
  tier2: [
    "Times of Israel", "Axios", "The Guardian", "PBS", "NBC News",
    "ABC News", "Sky News", "DW News", "UN News", "Naval News",
  ],
  // Tier 3: Everything else (no explicit list needed)
};

/**
 * Return the source tier (1, 2, or 3) for a given outlet name.
 * Matching is case-insensitive to handle minor variations.
 */
function getSourceTier(sourceName) {
  if (!sourceName) return 3;
  const lower = sourceName.toLowerCase();
  if (SOURCE_TIERS.tier1.some((s) => s.toLowerCase() === lower)) return 1;
  if (SOURCE_TIERS.tier2.some((s) => s.toLowerCase() === lower)) return 2;
  return 3;
}

// ---------------------------------------------------------------------------
// Known location coordinates — fallback when Claude omits lat/lng
// ---------------------------------------------------------------------------
const KNOWN_LOCATIONS = {
  "tehran": { lat: 35.6892, lng: 51.3890 },
  "isfahan": { lat: 32.6546, lng: 51.6680 },
  "shiraz": { lat: 29.5918, lng: 52.5837 },
  "tabriz": { lat: 38.0800, lng: 46.2919 },
  "mashhad": { lat: 36.2605, lng: 59.6168 },
  "natanz": { lat: 33.5131, lng: 51.9163 },
  "bushehr": { lat: 28.9234, lng: 50.8203 },
  "bandar abbas": { lat: 27.1865, lng: 56.2808 },
  "kermanshah": { lat: 34.3142, lng: 47.0650 },
  "sanandaj": { lat: 35.3219, lng: 46.9862 },
  "minab": { lat: 27.1058, lng: 57.0780 },
  "fars": { lat: 29.1043, lng: 53.0450 },
  "khuzestan": { lat: 31.3203, lng: 48.6693 },
  "beirut": { lat: 33.8938, lng: 35.5018 },
  "southern lebanon": { lat: 33.2721, lng: 35.2033 },
  "sidon": { lat: 33.5633, lng: 35.3697 },
  "tyre": { lat: 33.2705, lng: 35.1968 },
  "baalbek": { lat: 34.0047, lng: 36.2110 },
  "tel aviv": { lat: 32.0853, lng: 34.7818 },
  "haifa": { lat: 32.7940, lng: 34.9896 },
  "jerusalem": { lat: 31.7683, lng: 35.2137 },
  "baghdad": { lat: 33.3152, lng: 44.3661 },
  "erbil": { lat: 36.2021, lng: 44.0089 },
  "strait of hormuz": { lat: 26.5667, lng: 56.2500 },
  "indian ocean": { lat: 15.0000, lng: 65.0000 },
  "riyadh": { lat: 24.7136, lng: 46.6753 },
  "bahrain": { lat: 26.0667, lng: 50.5577 },
  "kuwait": { lat: 29.3759, lng: 47.9774 },
  "doha": { lat: 25.2854, lng: 51.5310 },
  "dubai": { lat: 25.2048, lng: 55.2708 },
  "abu dhabi": { lat: 24.4539, lng: 54.3773 },
  "damascus": { lat: 33.5138, lng: 36.2765 },
  "sanaa": { lat: 15.3694, lng: 44.1910 },
  "aden": { lat: 12.7855, lng: 45.0187 },
  "al-kharj": { lat: 24.1500, lng: 47.3000 },
  "iran": { lat: 32.4279, lng: 53.6880 },
  "iraq": { lat: 33.2232, lng: 43.6793 },
  "lebanon": { lat: 33.8547, lng: 35.8623 },
  "israel": { lat: 31.0461, lng: 34.8516 },
  "saudi arabia": { lat: 23.8859, lng: 45.0792 },
  "yemen": { lat: 15.5527, lng: 48.5164 },
  "syria": { lat: 34.8021, lng: 38.9968 },
};

/**
 * Try to fill in missing latitude/longitude from the event's region, country, or description.
 */
function geocodeFallback(event) {
  if (typeof event.latitude === "number" && typeof event.longitude === "number") return;
  const searchText = `${event.region || ""} ${event.country || ""} ${event.description || ""}`.toLowerCase();
  for (const [place, coords] of Object.entries(KNOWN_LOCATIONS)) {
    if (searchText.includes(place)) {
      event.latitude = coords.lat;
      event.longitude = coords.lng;
      if (!event.location_precision || event.location_precision === "exact") {
        event.location_precision = "region";
      }
      console.log(`  GEOCODE: Set ${place} coords for: ${(event.description || "").slice(0, 50)}...`);
      return;
    }
  }
}

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
 * Fetch the full text content of an article URL.
 * Uses a simple approach: fetch the page and extract text from <p> tags.
 * Returns the first ~2000 chars of article body text.
 */
async function fetchArticleBody(url) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; WarLibrary/1.0; +https://warlibrary.midatlantic.ai)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });
    if (!res.ok) return "";
    const html = await res.text();
    // Extract text from <p> tags
    const paragraphs = [];
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let m;
    while ((m = pRegex.exec(html)) !== null) {
      const text = m[1].replace(/<[^>]*>/g, "").trim();
      if (text.length > 40) paragraphs.push(text);
    }
    return paragraphs.join("\n").slice(0, 3000);
  } catch {
    return "";
  }
}

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
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error(`ERROR writing ${filePath}: ${err.message}`);
    if (typeof pipelineStats !== "undefined" && Array.isArray(pipelineStats.errors)) {
      pipelineStats.errors.push(`Write failed: ${filePath}: ${err.message}`);
    }
  }
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
 * Haversine distance in kilometers between two lat/lng points.
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Spatial-temporal duplicate check.
 * Two events are likely duplicates if ALL of:
 * - Same country
 * - Within 10km (Haversine) — tighter radius since multiple strikes hit nearby targets
 * - Within 6 hours — wars have multiple events per day in the same area
 * - At least one overlapping actor AND same event_type (require BOTH, not either)
 * - AND description similarity > 0.5 (to distinguish different strikes in same area)
 */
function isSpatioTemporalDuplicate(candidate, existingEvents) {
  const candidateTime = new Date(candidate.date).getTime();
  if (isNaN(candidateTime)) return false;

  for (const existing of existingEvents) {
    // Same country
    if (candidate.country !== existing.country) continue;

    // Within 10km (tightened from 50km — multiple targets in same city are distinct events)
    if (
      typeof candidate.latitude !== "number" ||
      typeof candidate.longitude !== "number" ||
      typeof existing.latitude !== "number" ||
      typeof existing.longitude !== "number"
    ) continue;
    const dist = haversineKm(
      candidate.latitude, candidate.longitude,
      existing.latitude, existing.longitude
    );
    if (dist > 10) continue;

    // Within 6 hours (tightened from 24h — wars have many events per day)
    const existingTime = new Date(existing.date).getTime();
    if (isNaN(existingTime)) continue;
    const timeDiffHours = Math.abs(candidateTime - existingTime) / 3600000;
    if (timeDiffHours > 6) continue;

    // Require BOTH: overlapping actor AND same event_type (was OR — way too aggressive)
    const candidateActors = Array.isArray(candidate.actors) ? candidate.actors : [];
    const existingActors = Array.isArray(existing.actors) ? existing.actors : [];
    const hasOverlappingActor = candidateActors.some((a) =>
      existingActors.some((b) => a.toLowerCase() === b.toLowerCase())
    );
    const sameEventType = candidate.event_type === existing.event_type;

    if (hasOverlappingActor && sameEventType) {
      // Final check: descriptions must also be somewhat similar
      const descSim = similarity(candidate.description, existing.description);
      if (descSim > 0.5) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check if a candidate event is a duplicate of any existing event.
 * Uses description similarity threshold of 0.85 (raised from 0.7 — in an active
 * war, many distinct events share common words like "Israeli", "strikes", "Iran",
 * "killed" which inflate Jaccard similarity between genuinely different events).
 * Date matching compares only the date portion (YYYY-MM-DD) not full timestamps,
 * since Claude may assign slightly different times to the same event.
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
    // High similarity + same date (day only) + same country
    const candidateDay = (candidate.date || "").slice(0, 10);
    const existingDay = (existing.date || "").slice(0, 10);
    if (
      candidateDay === existingDay &&
      candidate.country === existing.country &&
      similarity(candidate.description, existing.description) > 0.85
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

/**
 * Write pipeline stats to a JSON file so the admin health endpoint can report
 * on how the automated pipeline is performing.
 */
function writePipelineStats(stats) {
  const statsFile = path.join(DATA_DIR, "pipeline-stats.json");
  writeJSON(statsFile, stats);
  console.log(`Pipeline stats written to ${statsFile}`);
  appendPipelineHistory(stats);
}

/**
 * Append a pipeline stats entry to pipeline-history.json, keeping the last 100 entries.
 */
function appendPipelineHistory(stats) {
  const historyFile = path.join(DATA_DIR, "pipeline-history.json");
  let history = [];
  try {
    if (fs.existsSync(historyFile)) {
      const raw = fs.readFileSync(historyFile, "utf-8");
      history = JSON.parse(raw);
      if (!Array.isArray(history)) history = [];
    }
  } catch {
    history = [];
  }
  history.push(stats);
  // Keep only the last 100 entries
  if (history.length > 100) {
    history = history.slice(-100);
  }
  try {
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2), "utf-8");
    console.log(`Pipeline history appended (${history.length} entries).`);
  } catch (err) {
    console.error(`ERROR writing pipeline history: ${err.message}`);
  }
}

/**
 * Send a notification about new events via HTTP POST.
 */
function sendNewEventsNotification(uniqueEvents) {
  try {
    const adminToken = process.env.ADMIN_SECRET;
    if (!adminToken) {
      console.log("No ADMIN_SECRET set, skipping notification.");
      return;
    }
    const title = `${uniqueEvents.length} New Event${uniqueEvents.length === 1 ? "" : "s"}`;
    const summaryLines = uniqueEvents.slice(0, 5).map(
      (e) => `- [${e.country}] ${e.event_type}: ${(e.description || "").slice(0, 80)}`
    );
    const body = summaryLines.join("\n");
    const payload = JSON.stringify({ title, body });
    const url = new URL("http://localhost:3000/api/notifications");
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": adminToken,
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: 5000,
      },
      (res) => {
        console.log(`Notification POST responded with status ${res.statusCode}`);
      }
    );
    req.on("error", (err) => {
      console.warn(`Notification POST failed: ${err.message}`);
    });
    req.write(payload);
    req.end();
  } catch (err) {
    console.warn(`Failed to send notification: ${err.message}`);
  }
}

async function main() {
  const startTime = Date.now();

  // 90-second execution timeout — force-exit if the script hangs
  const executionTimeout = setTimeout(() => {
    console.error("FATAL: Execution timeout (90s) exceeded. Force-exiting.");
    process.exit(2);
  }, 90000);
  executionTimeout.unref(); // Don't keep process alive just for the timer

  console.log("=== War Library Event Update ===");
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Data dir: ${DATA_DIR}`);

  // Pipeline stats counters
  const pipelineStats = {
    last_run: new Date().toISOString(),
    articles_fetched: 0,
    articles_by_source: { "GDELT": 0, "Google News": 0, "Outlet RSS": 0 },
    events_extracted: 0,
    events_valid: 0,
    events_unique: 0,
    events_rejected_invalid: 0,
    events_rejected_duplicate: 0,
    events_rejected_spatiotemporal: 0,
    avg_confidence: 0,
    source_mix: {},
    verification_breakdown: { "confirmed": 0, "reported": 0, "claimed": 0, "disputed": 0, "unconfirmed": 0 },
    total_events_in_dataset: 0,
    status: "NO_NEW_EVENTS",
    errors: [],
    source_health: {},
    duration_ms: 0,
    api_input_tokens: 0,
    api_output_tokens: 0,
  };

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

  // 2. Fetch news articles from RSS/GDELT (skip priority URLs — they are static
  // historical pages that cause Claude to re-extract old events and waste tokens)
  console.log("\n--- Fetching news articles ---");

  console.log("Fetching from GDELT API...");
  let gdeltArticles = [];
  try {
    gdeltArticles = await fetchGDELT();
    pipelineStats.source_health["GDELT"] = gdeltArticles.length > 0 ? "ok" : "error";
  } catch (err) {
    console.error(`GDELT fetch error: ${err.message}`);
    pipelineStats.errors.push(`GDELT fetch error: ${err.message}`);
    pipelineStats.source_health["GDELT"] = err.name === "TimeoutError" ? "timeout" : "error";
  }
  console.log(`  GDELT: ${gdeltArticles.length} articles`);
  pipelineStats.articles_by_source["GDELT"] = gdeltArticles.length;

  console.log("Fetching from Google News RSS...");
  let googleArticles = [];
  try {
    googleArticles = await fetchGoogleNewsRSS();
    pipelineStats.source_health["Google News"] = googleArticles.length > 0 ? "ok" : "error";
  } catch (err) {
    console.error(`Google News fetch error: ${err.message}`);
    pipelineStats.errors.push(`Google News fetch error: ${err.message}`);
    pipelineStats.source_health["Google News"] = err.name === "TimeoutError" ? "timeout" : "error";
  }
  console.log(`  Google News: ${googleArticles.length} articles`);
  pipelineStats.articles_by_source["Google News"] = googleArticles.length;

  console.log("Fetching from outlet RSS feeds...");
  let outletArticles = [];
  try {
    outletArticles = await fetchOutletRSS();
    // Track individual outlet health from fetchOutletRSS
    for (const name of ["Al Jazeera", "BBC News", "New York Times", "Reuters"]) {
      const hasArticles = outletArticles.some((a) => a.source === name);
      pipelineStats.source_health[name] = hasArticles ? "ok" : "error";
    }
  } catch (err) {
    console.error(`Outlet RSS fetch error: ${err.message}`);
    pipelineStats.errors.push(`Outlet RSS fetch error: ${err.message}`);
    for (const name of ["Al Jazeera", "BBC News", "New York Times", "Reuters"]) {
      pipelineStats.source_health[name] = err.name === "TimeoutError" ? "timeout" : "error";
    }
  }
  console.log(`  Outlet RSS: ${outletArticles.length} articles`);
  pipelineStats.articles_by_source["Outlet RSS"] = outletArticles.length;

  // Combine all articles, deduplicate by URL
  const allArticlesRaw = [...gdeltArticles, ...googleArticles, ...outletArticles];
  const seenUrls = new Set();
  const allArticles = [];
  for (const art of allArticlesRaw) {
    if (!art.url || seenUrls.has(art.url)) continue;
    seenUrls.add(art.url);
    allArticles.push(art);
  }

  pipelineStats.articles_fetched = allArticles.length;
  console.log(`\nTotal unique articles fetched: ${allArticles.length}`);

  // --- Article URL cache: skip Claude call if we've seen all these URLs before ---
  const cacheFile = path.join(DATA_DIR, "article-url-cache.json");
  let cachedUrls = new Set();
  try {
    if (fs.existsSync(cacheFile)) {
      cachedUrls = new Set(JSON.parse(fs.readFileSync(cacheFile, "utf-8")));
    }
  } catch { /* ignore corrupt cache */ }
  const newArticleUrls = allArticles.filter((a) => !cachedUrls.has(a.url));
  console.log(`New article URLs not seen before: ${newArticleUrls.length} of ${allArticles.length}`);
  // Update cache with all current URLs (keep last 2000 to prevent unbounded growth)
  const updatedCache = [...cachedUrls, ...allArticles.map((a) => a.url)];
  try {
    fs.writeFileSync(cacheFile, JSON.stringify(updatedCache.slice(-2000)), "utf-8");
  } catch (err) {
    console.error(`ERROR writing cache file: ${err.message}`);
    pipelineStats.errors.push(`Cache write failed: ${err.message}`);
  }

  if (newArticleUrls.length === 0 && allArticles.length > 0) {
    console.log("All articles already seen in previous run — skipping Claude API call.");
    console.log("STATUS: NO_NEW_EVENTS");
    pipelineStats.status = "SKIPPED_NO_NEW_ARTICLES";
    pipelineStats.total_events_in_dataset = allEvents.length;
    pipelineStats.duration_ms = Date.now() - startTime;
    clearTimeout(executionTimeout);
    writePipelineStats(pipelineStats);
    process.exit(0);
  }

  if (allArticles.length === 0) {
    console.log("WARNING: No articles fetched from any source. All sources may be down.");
    console.log("STATUS: NO_NEW_EVENTS");
    pipelineStats.errors.push("No articles fetched from any source");
    pipelineStats.total_events_in_dataset = allEvents.length;
    pipelineStats.duration_ms = Date.now() - startTime;
    clearTimeout(executionTimeout);
    writePipelineStats(pipelineStats);
    process.exit(0);
  }

  // 3. Fetch full article bodies — only for NEW articles (not seen in cache), max 15
  // Sort: Tier 1 sources first, then by date
  const sortedNewArticles = [...newArticleUrls].sort((a, b) => {
    const tierA = getSourceTier(a.source);
    const tierB = getSourceTier(b.source);
    if (tierA !== tierB) return tierA - tierB;
    return (b.date || "").localeCompare(a.date || "");
  });
  const maxArticles = 20;
  const articlesToProcess = sortedNewArticles.slice(0, maxArticles);

  console.log(`\nFetching full article text for ${articlesToProcess.length} new articles...`);
  const CONCURRENT_FETCHES = 5;
  for (let i = 0; i < articlesToProcess.length; i += CONCURRENT_FETCHES) {
    const batch = articlesToProcess.slice(i, i + CONCURRENT_FETCHES);
    const bodies = await Promise.all(batch.map((art) => fetchArticleBody(art.url)));
    for (let j = 0; j < batch.length; j++) {
      batch[j].body = bodies[j];
    }
  }
  const articlesWithBody = articlesToProcess.filter((a) => a.body && a.body.length > 100).length;
  console.log(`  ${articlesWithBody} articles have substantial body text.`);

  const articleSummaries = articlesToProcess
    .map(
      (art, i) => {
        // Trim body to 1200 chars (was 2000) — enough for key facts, saves ~40% tokens
        const bodySnippet = art.body ? `\n    Body: ${art.body.slice(0, 1200)}` : "";
        return `[${i + 1}] ${art.title}\n    URL: ${art.url}\n    Source: ${art.source}\n    Date: ${art.date}${bodySnippet}`;
      }
    )
    .join("\n\n");

  // 4. Get the last 10 events as compact dedup context (was 20 — saves tokens)
  const sortedEvents = [...allEvents].sort((a, b) => {
    const da = a.date || "";
    const db = b.date || "";
    return db.localeCompare(da);
  });
  const recentEvents = sortedEvents.slice(0, 10);

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
    verification_status: "reported",
    location_precision: "city",
    civilian_impact: "12 civilians killed, hospital partially destroyed",
  };

  const prompt = `Extract conflict events from articles about the 2026 US-Israel war on Iran (Operation Epic Fury). Only real events from the articles — never fabricate. Return ONLY a JSON array.

event_type: "airstrike"|"missile_attack"|"drone_attack"|"battle"|"explosion"|"violence_against_civilians"|"strategic_development"|"protest"
verification_status: "confirmed"|"reported"|"claimed"|"disputed"|"unconfirmed" — use "claimed"/"reported" for unverified claims
location_precision: "exact"|"city"|"region"|"country"
fatalities: exact number from article only, 0 if unknown. Cumulative tolls → strategic_development with fatalities=0.
civilian_impact: brief phrase if mentioned, omit if not.
confidence: 0.0–1.0 based on source reliability.

JSON SCHEMA:
${JSON.stringify(schemaExample, null, 2)}

ALREADY IN DATABASE (do NOT extract these again):
${JSON.stringify(recentEvents.map((e) => ({ d: e.date?.slice(0, 10), c: e.country, t: e.event_type, s: (e.description || "").slice(0, 60) })))}

ARTICLES:
${articleSummaries}

Return ONLY a JSON array of new events. Empty array [] if none.`;

  // 6. Call Claude for extraction
  console.log("\nCalling Claude Haiku 4.5 to extract events from articles...");

  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });
  } catch (err) {
    console.error("ERROR calling Anthropic API:", err.message);
    pipelineStats.errors.push(`Claude API error: ${err.message}`);
    pipelineStats.duration_ms = Date.now() - startTime;
    clearTimeout(executionTimeout);
    writePipelineStats(pipelineStats);
    process.exit(1);
  }

  // Track API token usage
  if (response.usage) {
    pipelineStats.api_input_tokens = response.usage.input_tokens || 0;
    pipelineStats.api_output_tokens = response.usage.output_tokens || 0;
    console.log(`  API tokens used: ${pipelineStats.api_input_tokens} input, ${pipelineStats.api_output_tokens} output`);
  }

  const rawText =
    response.content &&
    response.content[0] &&
    response.content[0].type === "text"
      ? response.content[0].text
      : "";

  if (!rawText) {
    console.error("ERROR: Empty response from Claude.");
    pipelineStats.errors.push("Empty response from Claude API");
    pipelineStats.duration_ms = Date.now() - startTime;
    clearTimeout(executionTimeout);
    writePipelineStats(pipelineStats);
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
        pipelineStats.errors.push("Failed to parse JSON from Claude response");
        pipelineStats.duration_ms = Date.now() - startTime;
        clearTimeout(executionTimeout);
        writePipelineStats(pipelineStats);
        process.exit(1);
      }
    } else {
      console.error("ERROR: No JSON array found in Claude response.");
      console.error("Raw response:", rawText.slice(0, 500));
      pipelineStats.errors.push("No JSON array found in Claude response");
      pipelineStats.duration_ms = Date.now() - startTime;
      clearTimeout(executionTimeout);
      writePipelineStats(pipelineStats);
      process.exit(1);
    }
  }

  if (!Array.isArray(newEvents)) {
    console.error("ERROR: Response is not an array.");
    pipelineStats.errors.push("Claude response is not an array");
    pipelineStats.duration_ms = Date.now() - startTime;
    clearTimeout(executionTimeout);
    writePipelineStats(pipelineStats);
    process.exit(1);
  }

  pipelineStats.events_extracted = newEvents.length;
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

  // 8b. Default confidence, verification_status, and location_precision if missing
  const VALID_VERIFICATION_STATUSES = ["confirmed", "reported", "claimed", "disputed", "unconfirmed"];
  const VALID_LOCATION_PRECISIONS = ["exact", "city", "region", "country"];
  for (const event of newEvents) {
    if (typeof event.confidence !== "number" || event.confidence < 0 || event.confidence > 1) {
      event.confidence = 0.5;
    }
    if (!VALID_VERIFICATION_STATUSES.includes(event.verification_status)) {
      event.verification_status = "unconfirmed";
    }
    if (!VALID_LOCATION_PRECISIONS.includes(event.location_precision)) {
      event.location_precision = "region";
    }
  }

  // 8c. Adjust confidence based on source tier.
  // Tier 1 (wire services, major outlets) get a small boost because their
  // editorial processes make reporting more reliable. Tier 3 (unknown or
  // lesser-known outlets) are penalized because single-source reports from
  // unestablished outlets carry higher uncertainty.
  for (const event of newEvents) {
    const tier = getSourceTier(event.source);
    if (tier === 1) {
      event.confidence = Math.min(event.confidence + 0.1, 1.0);
    } else if (tier === 3) {
      event.confidence = Math.max(event.confidence - 0.15, 0.1);
    }
    // Tier 2: no adjustment
  }

  // 8d. Geocode fallback — fill in missing lat/lng from known locations
  for (const event of newEvents) {
    geocodeFallback(event);
  }

  // 9. Validate and deduplicate
  const validEvents = newEvents.filter((e) => {
    if (!isValidEvent(e)) {
      const missing = ["date","event_type","description","latitude","longitude","country","source_url"]
        .filter((f) => e[f] === undefined || e[f] === null || e[f] === "");
      console.log(
        `  SKIP (invalid schema, missing: ${missing.join(",")}): ${e.description?.slice(0, 60) || "no description"}...`
      );
      pipelineStats.events_rejected_invalid++;
      return false;
    }
    return true;
  });

  pipelineStats.events_valid = validEvents.length;

  const uniqueEvents = validEvents.filter((e) => {
    if (isDuplicate(e, allEvents)) {
      console.log(`  SKIP (duplicate): ${e.description?.slice(0, 60)}...`);
      pipelineStats.events_rejected_duplicate++;
      return false;
    }
    if (isSpatioTemporalDuplicate(e, allEvents)) {
      console.log(`  SKIP (spatio-temporal duplicate): ${e.description?.slice(0, 60)}...`);
      pipelineStats.events_rejected_spatiotemporal++;
      return false;
    }
    return true;
  });

  pipelineStats.events_unique = uniqueEvents.length;

  // Compute stats from accepted (unique) events
  if (uniqueEvents.length > 0) {
    const confidenceSum = uniqueEvents.reduce((sum, e) => sum + (e.confidence || 0), 0);
    pipelineStats.avg_confidence = Math.round((confidenceSum / uniqueEvents.length) * 100) / 100;
  }
  for (const e of uniqueEvents) {
    const src = e.source || "Unknown";
    pipelineStats.source_mix[src] = (pipelineStats.source_mix[src] || 0) + 1;
    const vs = e.verification_status || "unconfirmed";
    if (vs in pipelineStats.verification_breakdown) {
      pipelineStats.verification_breakdown[vs]++;
    }
  }

  console.log(
    `After validation: ${validEvents.length} valid, ${uniqueEvents.length} unique new events.`
  );

  // 10. Append to events_latest.json
  if (uniqueEvents.length === 0) {
    console.log("No new events to add.");
    console.log("STATUS: NO_NEW_EVENTS");
    pipelineStats.total_events_in_dataset = allEvents.length;
    pipelineStats.duration_ms = Date.now() - startTime;
    clearTimeout(executionTimeout);
    writePipelineStats(pipelineStats);
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

  pipelineStats.status = "EVENTS_ADDED";
  pipelineStats.total_events_in_dataset = allEvents.length + uniqueEvents.length;
  pipelineStats.duration_ms = Date.now() - startTime;
  clearTimeout(executionTimeout);
  writePipelineStats(pipelineStats);

  // Send notification about new events
  sendNewEventsNotification(uniqueEvents);

  console.log(`\nSTATUS: EVENTS_ADDED=${uniqueEvents.length}`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
