#!/usr/bin/env node
/**
 * generate-icons.mjs
 *
 * Generates all app-icon PNGs for koku from the 刻 (U+523B) glyph.
 *
 * WHY THIS EXISTS
 * ---------------
 * The browser tab / PWA icons must contain the 刻 mark. Rendering the glyph via
 * an SVG `<text>` element (or `next/og`'s bundled Geist font) is unreliable — a
 * browser rasterizing a favicon has no guaranteed access to a CJK font, so the
 * glyph collapses to a blank tile. The fix is to bake the glyph into real PNG
 * raster files at author time using a system CJK font, so the output is fully
 * self-contained and font-independent everywhere it is displayed.
 *
 * OUTPUTS (committed to the repo — regenerate with `npm run icons`):
 *   src/app/icon.png          32x32   (browser tab favicon, file convention)
 *   src/app/apple-icon.png    180x180 (iOS home-screen touch icon)
 *   public/icon-192.png       192x192 (PWA manifest)
 *   public/icon-512.png       512x512 (PWA manifest)
 *   public/icon-maskable.png  512x512 (PWA maskable — extra safe-area padding)
 *   public/icon-badge.png     96x96   (notification badge — monochrome alpha mask)
 *
 * Requires: sharp (installed) + cairosvg (system) for CJK rasterization.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";

import sharp from "sharp";

const ROOT = process.cwd();

// Accent-matched palette (mirrors --color-primary in globals.css).
const BG = "#a43a30"; // terracotta
const FG = "#fffaf3"; // warm off-white
const GLYPH = "刻";

/**
 * Build an SVG for the glyph mark.
 * @param {number} size    canvas size in px
 * @param {number} radius  corner radius in px (0 = square, for maskable)
 * @param {number} inset   glyph inset ratio (larger = more safe-area padding)
 */
function svg(size, radius, inset = 0.72) {
  const fontSize = Math.round(size * inset);
  const cy = size / 2 + fontSize * 0.02;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${BG}"/>
  <text x="50%" y="${cy}" fill="${FG}" text-anchor="middle" dominant-baseline="central"
        font-family="Hiragino Sans GB, Hiragino Mincho ProN, Noto Sans CJK JP, sans-serif"
        font-weight="600" font-size="${fontSize}">${GLYPH}</text>
</svg>`;
}

/**
 * The notification badge: the glyph alone, no plate, on transparency.
 *
 * `NotificationOptions.badge` is not a small copy of the app icon — Chrome and
 * Android treat it as an alpha mask and re-tint every non-transparent pixel to
 * suit the status bar. Feeding it the terracotta-plated 192px icon therefore
 * produced a solid coloured square with the 刻 invisible inside it, because the
 * plate is opaque and gets tinted along with the glyph. Solid white glyph on a
 * transparent ground is the only input that survives that pass.
 *
 * Generous inset: the badge is rendered around 16–24px, so the glyph needs the
 * whole canvas to stay legible at that size.
 */
function badgeSvg(size) {
  const fontSize = Math.round(size * 0.92);
  const cy = size / 2 + fontSize * 0.02;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <text x="50%" y="${cy}" fill="#ffffff" text-anchor="middle" dominant-baseline="central"
        font-family="Hiragino Sans GB, Hiragino Mincho ProN, Noto Sans CJK JP, sans-serif"
        font-weight="700" font-size="${fontSize}">${GLYPH}</text>
</svg>`;
}

/** Rasterize an SVG string to a PNG buffer using cairosvg (bundles CJK glyph). */
function rasterize(svgString, size) {
  const tmp = resolve(tmpdir(), `koku-icon-${size}-${Date.now()}.svg`);
  const outTmp = resolve(tmpdir(), `koku-icon-${size}-${Date.now()}.png`);
  writeFileSync(tmp, svgString, "utf8");
  try {
    execFileSync("cairosvg", [tmp, "-o", outTmp, "--output-width", String(size), "--output-height", String(size)], {
      stdio: "pipe",
    });
    return readFileSync(outTmp);
  } finally {
    rmSync(tmp, { force: true });
    rmSync(outTmp, { force: true });
  }
}

async function writeIcon(relPath, size, { radius = Math.round(size * 0.22), inset = 0.72 } = {}) {
  const out = resolve(ROOT, relPath);
  mkdirSync(dirname(out), { recursive: true });
  const png = rasterize(svg(size, radius, inset), size);
  // Normalise through sharp so metadata (size/type) is clean for Next's detector.
  await sharp(png).png({ compressionLevel: 9 }).toFile(out);
  console.log(`  ✓ ${relPath}  (${size}×${size})`);
}

async function writeBadge(relPath, size) {
  const out = resolve(ROOT, relPath);
  mkdirSync(dirname(out), { recursive: true });
  const png = rasterize(badgeSvg(size), size);
  await sharp(png).png({ compressionLevel: 9 }).toFile(out);
  console.log(`  ✓ ${relPath}  (${size}×${size}, monochrome badge)`);
}

async function main() {
  console.log("🎨  Generating koku 刻 app icons …");

  // Browser tab favicon — small, rounded.
  await writeIcon("src/app/icon.png", 64, { radius: 14 });
  // iOS touch icon — Apple auto-rounds, keep square.
  await writeIcon("src/app/apple-icon.png", 180, { radius: 0, inset: 0.66 });
  // PWA install icons.
  await writeIcon("public/icon-192.png", 192, { radius: 42 });
  await writeIcon("public/icon-512.png", 512, { radius: 112 });
  // Maskable — no rounding + generous safe area (glyph smaller).
  await writeIcon("public/icon-maskable.png", 512, { radius: 0, inset: 0.56 });
  // Notification badge — monochrome, transparent, no plate. See badgeSvg().
  await writeBadge("public/icon-badge.png", 96);

  // Remove the stale blank favicon.ico so it can't shadow icon.png.
  const staleIco = resolve(ROOT, "src/app/favicon.ico");
  if (existsSync(staleIco)) {
    rmSync(staleIco, { force: true });
    console.log("  ✓ removed stale src/app/favicon.ico");
  }

  console.log("✅  Done. Icons regenerate with `npm run icons`.");
}

main().catch((err) => {
  console.error("❌  Icon generation failed:", err.message);
  process.exit(1);
});
