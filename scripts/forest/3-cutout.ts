// Step 3, cut-out: 851-labs/background-remover on every asset and sprite sheet, then the sheets are
// sliced into cells and the animation sheets turned into looping previews.
// Usage: bun scripts/forest/3-cutout.ts

import { readdirSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { contact } from './contact';
import { dataUrl, pool, run, SAMPLES, spent } from './replicate';
import { closeSlicer, slice } from './slice';

const pick = (dir: string, skip: RegExp) =>
  readdirSync(join(SAMPLES, dir))
    .filter((f) => f.endsWith('.png') && !skip.test(f))
    .map((f) => join(SAMPLES, dir, f));

const assets = pick('2-assets', /^backdrop/);
const sheets = pick('2b-sheets', /^beetle-series/);

const cut = (file: string, step: string) => async () => {
  const [out] = await run(
    '851-labs/background-remover',
    { image: dataUrl(file), format: 'png', background_type: 'rgba' },
    {
      step,
      name: basename(file, '.png'),
    },
  );
  return { src: file, file: out! };
};
const cutAssets = (
  await pool(
    assets.map((f) => cut(f, '3-cutout')),
    4,
  )
).filter((r) => r !== undefined);
const cutSheets = (
  await pool(
    sheets.map((f) => cut(f, '3-cutout/sheets')),
    4,
  )
).filter((r) => r !== undefined);

console.log(
  await contact(
    join(SAMPLES, '3-cutout', 'sheet-assets.webp'),
    'cut-outs: 851-labs/background-remover',
    cutAssets.map((r) => ({ file: r.file, label: basename(r.file, '.png') })),
    { cols: 6 },
  ),
);

// Slice every sheet; animation sheets also become looping animated WebPs.
const ANIMATED = /^(beetle-walk|snail-crawl|mushroom-grow)/;
for (const s of cutSheets) {
  const name = basename(s.file, '.png');
  const dir = join(SAMPLES, '3-cutout', 'cells', name);
  const cells = await slice(s.file, dir, 'cell');
  console.log(`${name}: ${cells.length} cells`);
  await contact(
    join(SAMPLES, '3-cutout', `cells-${name}.webp`),
    `${name}: ${cells.length} cells`,
    cells.map((c, i) => ({ file: c.file, label: String(i) })),
    { cols: 8, width: 1200 },
  );
  if (ANIMATED.test(name)) {
    mkdirSync(join(SAMPLES, '3-cutout', 'anim'), { recursive: true });
    // Homebrew's ffmpeg has no WebP encoder; img2webp (from the webp formula) does animations.
    // A growth sequence holds its last frame before it starts over; walk and crawl cycles just loop.
    const files = cells.map((c) => c.file);
    const grow = name.startsWith('mushroom');
    const frames = grow ? ['-d', '250', ...files.slice(0, -1), '-d', '1500', files.at(-1)!] : ['-d', '110', ...files];
    await Bun.$`img2webp -loop 0 -lossy -q 75 ${frames} -o ${join(SAMPLES, '3-cutout', 'anim', name + '.webp')}`.quiet();
  }
}
await closeSlicer();
console.log(`spent so far: $${spent().toFixed(3)}`);
