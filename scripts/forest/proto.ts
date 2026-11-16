// Serves the composite prototype (scripts/forest/proto/) and captures it: stills at a few moments and a
// short animated WebP, in samples/7-proto/. With --serve it stays up for a look in a real browser.
// Usage: bun scripts/forest/proto.ts [--serve | --library]

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { SAMPLES } from './replicate';

const server = await createServer({
  root: import.meta.dir,
  configFile: false,
  logLevel: 'warn',
  server: { port: process.argv.includes('--serve') ? 5180 : 0 },
});
await server.listen();
const url = server.resolvedUrls!.local[0] + 'proto/';

if (process.argv.includes('--serve')) {
  console.log(`prototype: ${url}  ·  asset library: ${url}library.html`);
} else if (process.argv.includes('--tiling')) {
  // The soil tiling study (proto/tiling.ts): every technique over a whole view at half size, then 1:1 crops
  // where the blending shows (blur, ghost pebbles), and the hex tiling on each soil variant.
  const out = join(SAMPLES, '14-tiling');
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const shots: [string, string][] = [
    ['all-soil-0', 'cols=2&px=640'],
    ['all-soil-3', 'cols=2&px=640&soil=3'],
    ['detail', 'cols=4&px=480&world=480x360'],
    ['detail-soil-3', 'cols=4&px=480&world=480x360&soil=3'],
    ['patch-soil-3', 'modes=hex,hex,hp,hp&patch=1,2.5,1,2.5&cols=2&px=640&soil=3'],
  ];
  try {
    for (const [name, params] of shots) {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1440 }, deviceScaleFactor: 1 });
      page.on('pageerror', (e) => console.error(e));
      page.on('console', (m) => m.type() === 'error' && console.error(m.text()));
      await page.goto(url + 'tiling.html?' + params);
      await page.waitForFunction(() => window.ready, null, { timeout: 60000 });
      const f = join(out, `${name}.png`);
      await page.locator('#wrap').screenshot({ path: f });
      await Bun.$`cwebp -quiet -q 88 ${f} -o ${f.replace(/png$/, 'webp')}`;
      console.log(f.replace(/png$/, 'webp'));
      await page.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
} else if (process.argv.includes('--library')) {
  // Every page of the asset library viewer (loaded through the preloader) as a still.
  const out = join(SAMPLES, '7-proto');
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => console.error(e));
    await page.goto(url + 'library.html');
    await page.waitForFunction(() => 'pagesCount' in window, null, { timeout: 120000 });
    console.log(await page.locator('#label').textContent());
    const n = await page.evaluate(() => window.pagesCount);
    for (let i = 0; i < n; i++) {
      const name = await page.evaluate((k) => window.showPage(k), i);
      const f = join(out, `library-${name}.png`);
      await page.locator('canvas').screenshot({ path: f });
      await Bun.$`cwebp -quiet -q 85 ${f} -o ${f.replace(/png$/, 'webp')}`;
      console.log(f.replace(/png$/, 'webp'));
    }
  } finally {
    await browser.close();
    await server.close();
  }
} else {
  const out = join(SAMPLES, '7-proto');
  mkdirSync(join(out, 'frames'), { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => console.error(e));
    page.on('console', (m) => m.type() === 'error' && console.error(m.text()));
    await page.goto(
      url + '?capture' + (process.env.HIDE ? '&hide=' + process.env.HIDE : '') + (process.env.PARAMS ? '&' + process.env.PARAMS : ''),
    );
    await page.waitForFunction(() => window.ready, null, { timeout: 60000 });
    const canvas = page.locator('canvas');
    let t = 0;
    for (const at of process.env.QUICK ? [1] : [1, 12, 30, 60]) {
      await page.evaluate((s) => window.advance(s), at - t);
      t = at;
      await canvas.screenshot({ path: join(out, `still-${at}s.png`) });
      console.log(`still at ${at} s`);
    }
    // QUICK=1: one still only, while tuning.
    if (process.env.QUICK) process.exit(0);
    // 4 s at 12 fps for the animated preview.
    const files: string[] = [];
    for (let i = 0; i < 48; i++) {
      await page.evaluate(() => window.advance(1 / 12, 60));
      const f = join(out, 'frames', `${String(i).padStart(3, '0')}.png`);
      await canvas.screenshot({ path: f });
      files.push(f);
    }
    await Bun.$`img2webp -loop 0 -lossy -q 70 -d 83 ${files} -o ${join(out, 'proto.webp')}`.quiet();
    for (const at of [1, 12, 30, 60]) await Bun.$`cwebp -quiet -q 85 ${join(out, `still-${at}s.png`)} -o ${join(out, `still-${at}s.webp`)}`;
    console.log(`written to ${out}`);
  } finally {
    await browser.close();
    await server.close();
  }
}
