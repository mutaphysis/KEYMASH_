// Step 10: every asset the prototype uses, cut out again locally (matte/matte.py: a local mask, then the
// grey background taken out of the edge colours, which fixes the light halo of step 3's cut-outs),
// optionally colour-graded toward one palette, and the sheets sliced again. Free: no Replicate calls.
// Usage: bun scripts/forest/10-cut.ts [--model vision|birefnet|inspyrenet] [--grade]

import { existsSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { contact } from './contact';
import { SAMPLES } from './replicate';
import { closeSlicer, slice } from './slice';

const model = process.argv.includes('--model') ? process.argv[process.argv.indexOf('--model') + 1]! : 'inspyrenet';
const OUT = join(SAMPLES, '10-cut');
const MATTE = join(import.meta.dir, 'matte', 'matte.py');

const singles = [
  '9-broken/trunks-tall.png',
  '9-broken/snags.png',
  '9-broken/stump.png',
  '9-broken/log.png',
  '6-kit/ground.png',
  '2-assets/snail-nano-banana-2.png',
  '2-assets/roots-seedream-5-lite.png',
  '2-assets/rock-seedream-5-lite.png',
  '2-assets/glow-seedream-5-lite.png',
  '2-assets/pale-seedream-5-lite.png',
];
const sheets = [
  '2b-sheets/mushroom-grow-nano-banana-2.png',
  '2b-sheets/mushroom-grow-seedream-5-lite.png',
  '2b-sheets/mushroom-variety-nano-banana-2.png',
  '6-kit/bodies-side.png',
];

mkdirSync(join(OUT, 'sheets'), { recursive: true });
const cut = async (src: string, out: string) => {
  if (!existsSync(out)) await Bun.$`uv run --quiet ${MATTE} cut ${join(SAMPLES, src)} ${out} --model ${model}`;
  return out;
};
const cutSingles = [];
for (const s of singles) cutSingles.push(await cut(s, join(OUT, basename(s))));
const cutSheets = [];
for (const s of sheets) cutSheets.push(await cut(s, join(OUT, 'sheets', basename(s))));

// Colour grading: every asset partway toward the set's mean palette (Lab), so seedream's cooler, cleaner
// assets and nano-banana's warmer ones meet in the middle.
if (process.argv.includes('--grade')) await Bun.$`uv run --quiet ${MATTE} grade set ${join(OUT, 'graded')} ${cutSingles}`;

for (const s of cutSheets) {
  const name = basename(s, '.png');
  const cells = await slice(s, join(OUT, 'cells', name), 'cell');
  console.log(`${name}: ${cells.length} cells`);
}
await closeSlicer();
console.log(
  await contact(
    join(OUT, 'sheet.webp'),
    `local cut-outs (${model} + decontaminate)`,
    cutSingles.map((file) => ({ file, label: basename(file, '.png') })),
    { cols: 5 },
  ),
);
