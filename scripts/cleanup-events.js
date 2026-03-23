#!/usr/bin/env node
/**
 * cleanup-events.js — Deduplicate and fix events_latest.json
 *
 * Usage:
 *   node scripts/cleanup-events.js           # Dry run — shows what would change
 *   node scripts/cleanup-events.js --apply   # Actually write changes
 */

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "../src/data/events_latest.json");
const APPLY = process.argv.includes("--apply");

// ---------------------------------------------------------------------------
// Geocoder (reused from update-events.js)
// ---------------------------------------------------------------------------
const KNOWN_LOCATIONS = {
  "tehran": { lat: 35.6892, lng: 51.389 },
  "isfahan": { lat: 32.6546, lng: 51.668 },
  "shiraz": { lat: 29.5918, lng: 52.5837 },
  "tabriz": { lat: 38.08, lng: 46.2919 },
  "mashhad": { lat: 36.2605, lng: 59.6168 },
  "natanz": { lat: 33.5131, lng: 51.9163 },
  "bushehr": { lat: 28.9234, lng: 50.8203 },
  "bandar abbas": { lat: 27.1865, lng: 56.2808 },
  "kermanshah": { lat: 34.3142, lng: 47.065 },
  "sanandaj": { lat: 35.3219, lng: 46.9862 },
  "minab": { lat: 27.1058, lng: 57.078 },
  "fars": { lat: 29.1043, lng: 53.045 },
  "lamerd": { lat: 27.3358, lng: 53.1834 },
  "khuzestan": { lat: 31.3203, lng: 48.6693 },
  "qom": { lat: 34.6416, lng: 50.8746 },
  "karaj": { lat: 35.8401, lng: 50.9391 },
  "urmia": { lat: 37.5527, lng: 45.0761 },
  "absardar": { lat: 27.22, lng: 56.05 },
  "beirut": { lat: 33.8938, lng: 35.5018 },
  "southern lebanon": { lat: 33.2721, lng: 35.2033 },
  "sidon": { lat: 33.5633, lng: 35.3697 },
  "tyre": { lat: 33.2705, lng: 35.1968 },
  "baalbek": { lat: 34.0047, lng: 36.211 },
  "nabatieh": { lat: 33.3779, lng: 35.4839 },
  "tel aviv": { lat: 32.0853, lng: 34.7818 },
  "haifa": { lat: 32.794, lng: 34.9896 },
  "jerusalem": { lat: 31.7683, lng: 35.2137 },
  "beit shemesh": { lat: 31.7465, lng: 34.9884 },
  "baghdad": { lat: 33.3152, lng: 44.3661 },
  "erbil": { lat: 36.2021, lng: 44.0089 },
  "al-qa'im": { lat: 34.3764, lng: 41.0742 },
  "kirkuk": { lat: 35.4681, lng: 44.3922 },
  "strait of hormuz": { lat: 26.5667, lng: 56.25 },
  "indian ocean": { lat: 15.0, lng: 65.0 },
  "riyadh": { lat: 24.7136, lng: 46.6753 },
  "manama": { lat: 26.2285, lng: 50.586 },
  "bahrain": { lat: 26.0667, lng: 50.5577 },
  "kuwait": { lat: 29.3759, lng: 47.9774 },
  "doha": { lat: 25.2854, lng: 51.531 },
  "dubai": { lat: 25.2048, lng: 55.2708 },
  "abu dhabi": { lat: 24.4539, lng: 54.3773 },
  "sohar": { lat: 24.3643, lng: 56.7358 },
  "muscat": { lat: 23.588, lng: 58.3829 },
  "damascus": { lat: 33.5138, lng: 36.2765 },
  "sanaa": { lat: 15.3694, lng: 44.191 },
  "cyprus": { lat: 35.1264, lng: 33.4299 },
  "akrotiri": { lat: 34.5841, lng: 32.9888 },
  "galle": { lat: 6.0535, lng: 80.2210 },
};

// Country capitals for 0,0 coord fallback
const COUNTRY_CAPITALS = {
  "Iran": { lat: 35.6892, lng: 51.389 },
  "Iraq": { lat: 33.3152, lng: 44.3661 },
  "Lebanon": { lat: 33.8938, lng: 35.5018 },
  "Israel": { lat: 31.7683, lng: 35.2137 },
  "Syria": { lat: 33.5138, lng: 36.2765 },
  "Saudi Arabia": { lat: 24.7136, lng: 46.6753 },
  "Bahrain": { lat: 26.2285, lng: 50.586 },
  "Kuwait": { lat: 29.3759, lng: 47.9774 },
  "Qatar": { lat: 25.2854, lng: 51.531 },
  "UAE": { lat: 24.4539, lng: 54.3773 },
  "United Arab Emirates": { lat: 24.4539, lng: 54.3773 },
  "Yemen": { lat: 15.3694, lng: 44.191 },
  "Oman": { lat: 23.588, lng: 58.3829 },
  "Turkey": { lat: 39.9334, lng: 32.8597 },
  "United States": { lat: 38.9072, lng: -77.0369 },
  "Cyprus": { lat: 35.1264, lng: 33.4299 },
  "Azerbaijan": { lat: 40.4093, lng: 49.8671 },
  "India": { lat: 28.6139, lng: 77.209 },
  "Sri Lanka": { lat: 6.9271, lng: 79.8612 },
};

// Tier 1 sources get priority when keeping duplicates
const TIER1_SOURCES = ["bbc", "reuters", "al jazeera", "associated press", "ap news", "npr", "guardian", "new york times", "nyt", "cnn", "washington post"];

// Known cumulative fatality values
const KNOWN_CUMULATIVE = new Set([486, 217, 555, 787, 1045, 1230, 1255, 1300, 1348, 1444, 4300]);

// Extended-window topic rules — ONLY for specific known incidents that get
// re-reported for weeks. These are narrow enough to not cause false merges.
// Everything else uses word overlap within a 3-day window.
const EXTENDED_TOPIC_RULES = [
  // The Minab school strike gets re-reported for 2+ weeks
  { name: "minab_school", require: [["minab", "shajareh"], ["school", "students", "girls", "children"]], maxWindow: 20 },
  // KC-135 is a very specific identifier
  { name: "kc135_crash",  require: [["kc-135"]], maxWindow: 10 },
  // IRIS Dena is a specific ship name
  { name: "iris_dena",    require: [["iris dena", "dena destroyer", "dena frigate", "dena warship"]], maxWindow: 10 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysBetween(d1, d2) {
  return Math.abs(new Date(d1).getTime() - new Date(d2).getTime()) / 86400000;
}

function wordSet(text) {
  return new Set((text || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 3));
}

function wordOverlap(a, b) {
  const setA = wordSet(a);
  const setB = wordSet(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let overlap = 0;
  for (const w of setA) if (setB.has(w)) overlap++;
  return overlap / Math.min(setA.size, setB.size);
}

function getExtendedTopics(text) {
  const lower = (text || "").toLowerCase();
  const topics = [];
  for (const rule of EXTENDED_TOPIC_RULES) {
    const allSlotsMatch = rule.require.every(
      slot => slot.some(term => lower.includes(term))
    );
    if (allSlotsMatch) {
      topics.push(rule.name);
    }
  }
  return topics;
}

function getTopicWindow(topicName) {
  const rule = EXTENDED_TOPIC_RULES.find(r => r.name === topicName);
  return rule ? rule.maxWindow : 3;
}

function isTier1(source) {
  const s = (source || "").toLowerCase();
  return TIER1_SOURCES.some(t => s.includes(t));
}

function isCumulative(event) {
  if (KNOWN_CUMULATIVE.has(event.fatalities)) return true;
  if (event.fatalities <= 200) return false;
  const desc = (event.description || "").toLowerCase();
  const cumulativePatterns = [
    "death toll", "total", "surpass", "rises to", "risen to",
    "cumulative", "since the", "since february", "since march",
    "total killed", "total dead", "total casualties",
    "according to.*ministry", "according to.*red crescent",
    "health ministry",
  ];
  return cumulativePatterns.some(p => new RegExp(p).test(desc));
}

function isGenericIranCenter(lat, lng) {
  return Math.abs(lat - 32.4279) < 0.01 && Math.abs(lng - 53.688) < 0.01;
}

function isZeroCoords(lat, lng) {
  return lat === 0 && lng === 0;
}

function tryGeocode(event) {
  const searchText = `${event.region || ""} ${event.country || ""} ${event.description || ""}`.toLowerCase();
  for (const [place, coords] of Object.entries(KNOWN_LOCATIONS)) {
    if (searchText.includes(place)) {
      return { lat: coords.lat, lng: coords.lng, place };
    }
  }
  // Fall back to country capital
  if (event.country && COUNTRY_CAPITALS[event.country]) {
    const c = COUNTRY_CAPITALS[event.country];
    return { lat: c.lat, lng: c.lng, place: event.country + " (capital)" };
  }
  return null;
}

function scoreEvent(event) {
  let score = 0;
  if (event.source_url) score += 3;
  if (isTier1(event.source)) score += 3;
  if (event.confidence) score += event.confidence * 2;
  if (event.fatalities > 0 && !isCumulative(event)) score += 2;
  if (!isZeroCoords(event.latitude, event.longitude) && !isGenericIranCenter(event.latitude, event.longitude)) score += 2;
  if (event.region) score += 1;
  if (event.civilian_impact) score += 1;
  if (event.verification_status === "confirmed") score += 2;
  return score;
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

function areDuplicates(a, b) {
  // Must be same country (or at least one non-standard)
  const sameCountry = a.country === b.country ||
    ["Multiple", "Global", "International", "Gulf Region"].includes(a.country) ||
    ["Multiple", "Global", "International", "Gulf Region"].includes(b.country);

  if (!sameCountry) return false;

  const days = daysBetween(a.date, b.date);

  // Check if both match an extended-window topic (Minab school, KC-135, IRIS Dena)
  const topicsA = getExtendedTopics(a.description);
  const topicsB = getExtendedTopics(b.description);
  const sharedTopics = topicsA.filter(t => topicsB.includes(t));

  if (sharedTopics.length > 0) {
    const maxWindow = Math.max(...sharedTopics.map(getTopicWindow));
    if (days <= maxWindow) return true;
  }

  // For non-topic matches, require tight criteria
  if (days > 3) return false;

  // Same source URL = same article
  if (a.source_url && b.source_url && a.source_url === b.source_url) return true;

  // Very high word overlap (same story, different source)
  const overlap = wordOverlap(a.description, b.description);
  if (overlap >= 0.6) return true;

  return false;
}

function clusterEvents(events) {
  const clusters = [];
  const assigned = new Set();

  for (let i = 0; i < events.length; i++) {
    if (assigned.has(i)) continue;

    const cluster = [i];
    assigned.add(i);
    // SEED-ONLY matching: only compare against the first event (seed),
    // NOT any cluster member. This prevents transitive chaining where
    // A~B and B~C causes A~C even though A and C are unrelated.
    const seed = events[i];

    for (let j = i + 1; j < events.length; j++) {
      if (assigned.has(j)) continue;
      if (areDuplicates(seed, events[j])) {
        cluster.push(j);
        assigned.add(j);
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

// ---------------------------------------------------------------------------
// Country normalization
// ---------------------------------------------------------------------------

function inferCountry(event) {
  const desc = (event.description || "").toLowerCase();
  const mapping = [
    [/\biran\b/, "Iran"],
    [/\blebano[n]?\b/, "Lebanon"],
    [/\bisrael\b/, "Israel"],
    [/\bbahrain\b/, "Bahrain"],
    [/\bkuwait\b/, "Kuwait"],
    [/\bqatar\b/, "Qatar"],
    [/\bsaudi\b/, "Saudi Arabia"],
    [/\buae\b|emirates/, "United Arab Emirates"],
    [/\biraq\b/, "Iraq"],
    [/\boman\b/, "Oman"],
    [/\bturkey\b|türkiye/, "Turkey"],
    [/\bcyprus\b/, "Cyprus"],
    [/\bsyria\b/, "Syria"],
    [/\byemen\b/, "Yemen"],
    [/\bunited states\b|\bu\.s\.\b|\bamerica\b/, "United States"],
  ];
  for (const [rx, country] of mapping) {
    if (rx.test(desc)) return country;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log(`\n=== Event Cleanup Script ===`);
  console.log(`Mode: ${APPLY ? "APPLY (will write changes)" : "DRY RUN (preview only)"}\n`);

  const obj = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const events = obj.events;

  const stats = {
    totalBefore: events.length,
    fatalitiesBefore: events.reduce((s, e) => s + (e.fatalities || 0), 0),
    dupsRemoved: 0,
    cumulativeZeroed: 0,
    cumulativeFatalitiesRemoved: 0,
    coordsFixed: 0,
    countriesFixed: 0,
  };

  // 1. Fix cumulative death tolls
  console.log("--- STEP 1: Fix cumulative death tolls ---");
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.fatalities > 0 && isCumulative(e)) {
      console.log(`  ZERO idx=${i} fatalities=${e.fatalities} — "${(e.description || "").slice(0, 80)}..."`);
      stats.cumulativeFatalitiesRemoved += e.fatalities;
      stats.cumulativeZeroed++;
      e.fatalities = 0;
    }
  }
  console.log(`  Zeroed ${stats.cumulativeZeroed} cumulative entries (${stats.cumulativeFatalitiesRemoved} false fatalities)\n`);

  // 2. Fix coordinates
  console.log("--- STEP 2: Fix coordinates ---");
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const needsFix = isZeroCoords(e.latitude, e.longitude) ||
      (isGenericIranCenter(e.latitude, e.longitude) && e.country !== "Iran") ||
      (isGenericIranCenter(e.latitude, e.longitude) && e.region);

    if (needsFix) {
      const geo = tryGeocode(e);
      if (geo && !(Math.abs(geo.lat - e.latitude) < 0.01 && Math.abs(geo.lng - e.longitude) < 0.01)) {
        console.log(`  FIX idx=${i} (${e.latitude},${e.longitude}) → (${geo.lat},${geo.lng}) [${geo.place}]`);
        e.latitude = geo.lat;
        e.longitude = geo.lng;
        e.location_precision = "city";
        stats.coordsFixed++;
      }
    }
  }
  console.log(`  Fixed ${stats.coordsFixed} coordinates\n`);

  // 3. Fix country values
  console.log("--- STEP 3: Fix country values ---");
  const nonStandard = ["Multiple", "Global", "International", "Gulf Region", "NATO member", "Iran/Oman"];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (nonStandard.includes(e.country)) {
      const inferred = inferCountry(e);
      if (inferred) {
        console.log(`  FIX idx=${i} "${e.country}" → "${inferred}"`);
        e.country = inferred;
        stats.countriesFixed++;
        // Also fix coords if they were at 0,0
        if (isZeroCoords(e.latitude, e.longitude)) {
          const geo = tryGeocode(e);
          if (geo) {
            e.latitude = geo.lat;
            e.longitude = geo.lng;
          }
        }
      }
    }
  }
  console.log(`  Fixed ${stats.countriesFixed} country values\n`);

  // 4. Deduplicate
  console.log("--- STEP 4: Deduplicate ---");
  console.log("  Clustering events (this may take a moment)...");
  const clusters = clusterEvents(events);
  const dupClusters = clusters.filter(c => c.length > 1);
  console.log(`  Found ${dupClusters.length} duplicate clusters out of ${clusters.length} total\n`);

  // For each duplicate cluster, keep the best and mark rest for removal
  const removeSet = new Set();
  let topDups = 0;

  for (const cluster of dupClusters) {
    // Score each event in the cluster
    const scored = cluster.map(idx => ({ idx, score: scoreEvent(events[idx]) }));
    scored.sort((a, b) => b.score - a.score);
    const keep = scored[0];
    const remove = scored.slice(1);

    if (topDups < 20) {
      const e = events[keep.idx];
      console.log(`  CLUSTER (${cluster.length} events): "${(e.description || "").slice(0, 70)}..."`);
      console.log(`    KEEP idx=${keep.idx} score=${keep.score.toFixed(1)} source="${e.source}"`);
      for (const r of remove.slice(0, 3)) {
        const re = events[r.idx];
        console.log(`    DROP idx=${r.idx} score=${r.score.toFixed(1)} source="${re.source}"`);
      }
      if (remove.length > 3) console.log(`    ... and ${remove.length - 3} more`);
    }
    topDups++;

    for (const r of remove) {
      removeSet.add(r.idx);
    }
  }

  if (topDups > 20) console.log(`  ... and ${topDups - 20} more clusters`);

  stats.dupsRemoved = removeSet.size;
  console.log(`\n  Removing ${stats.dupsRemoved} duplicate events\n`);

  // Build cleaned array
  const cleaned = events.filter((_, i) => !removeSet.has(i));

  const statsAfter = {
    totalAfter: cleaned.length,
    fatalitiesAfter: cleaned.reduce((s, e) => s + (e.fatalities || 0), 0),
  };

  // Summary
  console.log("=== SUMMARY ===");
  console.log(`  Events:     ${stats.totalBefore} → ${statsAfter.totalAfter} (removed ${stats.dupsRemoved})`);
  console.log(`  Fatalities: ${stats.fatalitiesBefore} → ${statsAfter.fatalitiesAfter} (removed ${stats.fatalitiesBefore - statsAfter.fatalitiesAfter})`);
  console.log(`  Cumulative tolls zeroed: ${stats.cumulativeZeroed}`);
  console.log(`  Coordinates fixed: ${stats.coordsFixed}`);
  console.log(`  Countries fixed: ${stats.countriesFixed}`);
  console.log(`  Duplicate clusters: ${dupClusters.length}`);
  console.log();

  if (APPLY) {
    // Backup
    const backupPath = DATA_FILE.replace(".json", `.backup-${Date.now()}.json`);
    fs.copyFileSync(DATA_FILE, backupPath);
    console.log(`  Backup saved to: ${backupPath}`);

    // Write cleaned data
    obj.events = cleaned;
    obj.metadata.note = `Cleaned ${new Date().toISOString().slice(0, 10)}. ${cleaned.length} events after dedup.`;
    fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2));
    console.log(`  Written ${cleaned.length} events to ${DATA_FILE}`);
  } else {
    console.log("  DRY RUN — no changes written. Run with --apply to save.");
  }
}

main();
