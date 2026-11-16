// Step 9: the woody assets again, broken off the way trees break in an old forest. Steps 2 and 6 gave
// sawn stumps and logs with flat cut ends, which read as a tidy park, not as wild woodland.
// Cut out locally (scripts/forest/matte/), with the grey background taken out of the edges.
// Usage: bun scripts/forest/9-broken.ts

import { join } from 'node:path';
import { contact } from './contact';
import { dataUrl, pool, run, SAMPLES, spent } from './replicate';

const ref = dataUrl(join(SAMPLES, 'reference.webp'));
// The reference sets the mood only: its composition has problems (mushrooms underground, …).
const STYLE =
  'Use the reference image only for its mood, palette and textures, not its composition: photorealistic but slightly surreal, ' +
  'thick green moss and pale lichen, warm amber tones, soft light from the upper left. ';
export const NATURAL =
  'Wood is never sawn or cut: every top and every end is snapped, broken off, splintered, jagged, rotten and weathered, ' +
  'the way trees break and decay in an old wild forest. ';
const GREY = ' Plain flat even light grey studio background, no ground, no other objects, no glow, no shadows, no text.';

const ASSETS: Record<string, { prompt: string; aspect: string }> = {
  snags: {
    prompt:
      STYLE +
      NATURAL +
      'Four different dead tree trunks (snags) side by side, each standing on its mossy flaring roots at the bottom of the image ' +
      'and snapped off at a different height with a jagged splintered top: one hollow, one with big bracket fungi, one leaning, ' +
      'one birch with peeling bark. Wide empty gaps between them, the roots of neighbours do not touch.' +
      GREY,
    aspect: '16:9',
  },
  'trunks-tall': {
    prompt:
      STYLE +
      'Four different tall old living tree trunks side by side, each rising from mossy flaring roots at the bottom of the image ' +
      'and continuing out of the top edge of the image: a smooth beech, a gnarled oak with lichen, a leaning trunk with a hollow, a birch. ' +
      'Wide empty gaps between them, the roots of neighbours do not touch.' +
      GREY,
    aspect: '16:9',
  },
  stump: {
    prompt:
      STYLE +
      NATURAL +
      'A rotten hollow tree stump, side view, its top broken off in tall jagged splinters of different heights, soft crumbling wood, ' +
      'bracket fungi and moss on the sides.' +
      GREY,
    aspect: '1:1',
  },
  log: {
    prompt:
      STYLE +
      NATURAL +
      'A fallen mossy tree trunk lying horizontally, side view: one end a torn-up root plate with dangling roots and clumps of soil, ' +
      'the other end snapped and splintered, the bark partly peeled, a few tiny mushrooms on top.' +
      GREY,
    aspect: '16:9',
  },
};

const results = (
  await pool(
    Object.entries(ASSETS).map(([name, a]) => async () => {
      const [file] = await run(
        'google/nano-banana-2',
        { prompt: a.prompt, image_input: [ref], aspect_ratio: a.aspect, output_format: 'png' },
        { step: '9-broken', name },
      );
      return { name, file: file! };
    }),
    4,
  )
).filter((r) => r !== undefined);

// Local cut-out: Apple Vision mask + background decontamination (see matte/matte.py).
for (const r of results) {
  await Bun.$`uv run --quiet ${join(import.meta.dir, 'matte', 'matte.py')} cut ${r.file} ${join(SAMPLES, '9-broken', 'cut', r.name + '.png')} --model vision`.quiet();
}
console.log(
  await contact(
    join(SAMPLES, '9-broken', 'sheet.webp'),
    'broken off, not sawn (nano-banana-2, cut out locally)',
    results.flatMap((r) => [
      { file: r.file, label: r.name },
      { file: join(SAMPLES, '9-broken', 'cut', r.name + '.png'), label: `${r.name} · cut-out` },
    ]),
    { cols: 4 },
  ),
);
console.log(`spent so far: $${spent().toFixed(3)}`);
