// Renders the cheat-sheet pictures: every card in src/modes/<id>/sheet.ts is played through the real
// VM / culture and renderer in headless Chromium (scripts/sheet/), and its last frame is saved as
// src/modes/<id>/sheet/<card>.webp. Also rewrites the picture table in src/modes/<id>/README.md.
// Usage: bun scripts/sheet.ts   (first time: bunx playwright-core install chromium-headless-shell)
import { createServer } from 'vite';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { chromium } from 'playwright-core';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { Shot } from './sheet/shoot';

const ROOT = new URL('..', import.meta.url).pathname;
const START = '<!-- sheet:start (bun scripts/sheet.ts writes this table) -->';
const END = '<!-- sheet:end -->';

const server = await createServer({
  root: ROOT,
  configFile: false,
  logLevel: 'warn',
  plugins: [vanillaExtractPlugin()],
  define: { __APP_VERSION__: '"sheet"', __GIT_SHA__: '"sheet"', __BUILD_NUMBER__: '""', __BUILD_TIME__: '""' },
  server: { port: 0 },
});
await server.listen();
const browser = await chromium.launch();
let shots: Shot[];
try {
  // English text, and a 2x screen so the renderers draw at their highest resolution (1.5x)
  const page = await browser.newPage({ locale: 'en-US', deviceScaleFactor: 2 });
  page.on('pageerror', (e) => console.error(e));
  await page.goto(server.resolvedUrls!.local[0] + 'scripts/sheet/');
  await page.waitForFunction(() => 'shots' in window);
  shots = await page.evaluate(() => window.shots());
} finally {
  await browser.close();
  await server.close();
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

for (const mode of new Set(shots.map((s) => s.mode))) {
  const mine = shots.filter((s) => s.mode === mode);
  const dir = `${ROOT}src/modes/${mode}/sheet/`;
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) if (f.endsWith('.webp')) rmSync(dir + f); // cards that are gone
  for (const s of mine) writeFileSync(dir + s.id + '.webp', Buffer.from(s.webp.split(',')[1]!, 'base64'));

  // three cards per row
  const rows: string[] = [];
  for (let i = 0; i < mine.length; i += 3)
    rows.push(
      '<tr>\n' +
        mine
          .slice(i, i + 3)
          .map((s) => `<td width="33%"><img src="sheet/${s.id}.webp" alt=""><br><b>${esc(s.name)}</b> <code>${esc(s.code)}</code></td>`)
          .join('\n') +
        '\n</tr>',
    );
  const table = `${START}\n<table>\n${rows.join('\n')}\n</table>\n${END}`;
  const readme = `${ROOT}src/modes/${mode}/README.md`;
  const md = readFileSync(readme, 'utf8');
  const a = md.indexOf(START),
    b = md.indexOf(END);
  if (a < 0 || b < a) throw new Error(`${readme}: add the markers ${START} … ${END}`);
  writeFileSync(readme, md.slice(0, a) + table + md.slice(b + END.length));
  console.log(`${mode}: ${mine.length} pictures, README table updated`);
}
