#!/usr/bin/env node
/**
 * Submit URLs to IndexNow (Bing, Yandex, Seznam, Naver share the endpoint).
 *
 *   node scripts/indexnow.js https://warlibrary.midatlantic.ai/country/iran ...
 *   node scripts/indexnow.js --sitemap   (every URL in the countries + pages sitemaps)
 *
 * The key is the name of the .txt file in public/ (IndexNow verifies ownership
 * by fetching https://<host>/<key>.txt). Nothing here is secret.
 */
const fs = require("fs");
const path = require("path");

const HOST = "warlibrary.midatlantic.ai";
const SITE = `https://${HOST}`;

function findKey() {
  const dir = path.join(__dirname, "..", "public");
  const file = fs.readdirSync(dir).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
  if (!file) throw new Error("No IndexNow key file in public/ (expected <32 hex>.txt)");
  return file.replace(/\.txt$/, "");
}

async function urlsFromSitemaps() {
  const urls = [];
  for (const name of ["pages.xml", "countries.xml"]) {
    const res = await fetch(`${SITE}/sitemaps/${name}`);
    if (!res.ok) throw new Error(`${name}: ${res.status}`);
    const xml = await res.text();
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) urls.push(m[1]);
  }
  return urls;
}

async function main() {
  const args = process.argv.slice(2);
  const urls = args.includes("--sitemap")
    ? await urlsFromSitemaps()
    : args.filter((a) => a.startsWith("http"));
  if (urls.length === 0) {
    console.error("Nothing to submit. Pass URLs or --sitemap.");
    process.exit(1);
  }
  const key = findKey();
  const body = { host: HOST, key, keyLocation: `${SITE}/${key}.txt`, urlList: urls.slice(0, 10_000) };
  const res = await fetch("https://api.indexnow.org/IndexNow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  console.log(`IndexNow: ${res.status} ${res.statusText} for ${urls.length} URL(s)`);
  if (res.status >= 400) process.exit(1);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
