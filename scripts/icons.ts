// Renders scripts/icon.svg to the PWA / iOS / favicon PNGs in public/ (headless Chromium via playwright-core).
// Usage: bun scripts/icons.ts   — the PNGs are committed, so this only runs when the icon changes.
// First time: bunx playwright-core install chromium-headless-shell
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const SVG = readFileSync(ROOT + 'scripts/icon.svg', 'utf8');
// [file, size, scale of the artwork]; maskable icons keep the art inside the 80% safe zone
const TARGETS: [string, number, number][] = [
  ['icon-192.png', 192, 1.0],
  ['icon-512.png', 512, 1.0],
  ['icon-maskable-512.png', 512, 0.78],
  ['apple-touch-icon.png', 180, 0.92],
  ['favicon-32.png', 32, 1.0],
];

const browser = await chromium.launch();
try {
  for (const [name, size, scale] of TARGETS) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const svg = SVG.replace('<g id="art">', `<g id="art" transform="translate(256 256) scale(${scale}) translate(-256 -256)">`).replace(
      '<svg ',
      `<svg width="${size}" height="${size}" `,
    );
    await page.setContent(`<html><body style="margin:0;background:#000800">${svg}</body></html>`);
    await page.waitForTimeout(150);
    await page.screenshot({ path: ROOT + 'public/' + name, clip: { x: 0, y: 0, width: size, height: size } });
    await page.close();
  }
} finally {
  await browser.close();
}
writeFileSync(ROOT + 'public/icon.svg', SVG);
console.log('icons written to public/');
