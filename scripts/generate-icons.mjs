// Generate PWA icons from SVG template
// Run: node scripts/generate-icons.mjs
// Requires: sharp (npm install sharp --save-dev)

import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = path.resolve(__dirname, "../public/icons");

// War Library icon — dark background, "WL" monogram with red accent
const createIconSvg = (size, maskable = false) => {
  const padding = maskable ? Math.round(size * 0.2) : Math.round(size * 0.08);
  const innerSize = size - padding * 2;
  const fontSize = Math.round(innerSize * 0.38);
  const smallFontSize = Math.round(innerSize * 0.12);
  const cx = size / 2;
  const cy = size / 2;
  const barY = cy + fontSize * 0.35;
  const barWidth = innerSize * 0.55;

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="#0a0a0a" rx="${maskable ? 0 : Math.round(size * 0.15)}"/>
  <text x="${cx}" y="${cy - fontSize * 0.05}" text-anchor="middle" dominant-baseline="central"
    font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="${fontSize}" fill="#e4e4e7"
    letter-spacing="${Math.round(fontSize * 0.08)}">WL</text>
  <rect x="${cx - barWidth / 2}" y="${barY}" width="${barWidth}" height="${Math.max(2, Math.round(size * 0.012))}" fill="#ef4444" rx="1"/>
  <text x="${cx}" y="${barY + smallFontSize * 1.8}" text-anchor="middle"
    font-family="system-ui, -apple-system, sans-serif" font-weight="500" font-size="${smallFontSize}" fill="#71717a"
    letter-spacing="${Math.round(smallFontSize * 0.15)}">WAR LIBRARY</text>
</svg>`;
};

const sizes = [
  { size: 192, maskable: false, name: "icon-192.png" },
  { size: 512, maskable: false, name: "icon-512.png" },
  { size: 192, maskable: true, name: "icon-maskable-192.png" },
  { size: 512, maskable: true, name: "icon-maskable-512.png" },
  { size: 180, maskable: false, name: "apple-touch-icon.png" },
  { size: 32, maskable: false, name: "favicon-32.png" },
  { size: 16, maskable: false, name: "favicon-16.png" },
];

for (const { size, maskable, name } of sizes) {
  const svg = createIconSvg(size, maskable);
  const outputPath = path.join(ICONS_DIR, name);
  await sharp(Buffer.from(svg)).png().toFile(outputPath);
  console.log(`Generated: ${name} (${size}x${size}${maskable ? " maskable" : ""})`);
}

// Also copy apple-touch-icon to public root
const appleSvg = createIconSvg(180, false);
await sharp(Buffer.from(appleSvg))
  .png()
  .toFile(path.resolve(__dirname, "../public/apple-touch-icon.png"));
console.log("Generated: public/apple-touch-icon.png");

console.log("\nAll icons generated!");
