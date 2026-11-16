// Step 2b, sprite sheets: many small, simple critters and mushrooms per call, and whether a model
// can draw an animation cycle (walk, crawl, grow) as consistent frames in a grid.
// Usage: bun scripts/forest/2b-sheets.ts [reference.webp]

import { join } from 'node:path';
import { contact } from './contact';
import { dataUrl, pool, run, SAMPLES, spent } from './replicate';

const REF = process.argv[2] ?? join(SAMPLES, 'reference.webp');
const ref = dataUrl(REF);

const STYLE =
  'In the look of the reference image: photorealistic but slightly surreal, mossy, warm amber tones, soft light from the upper left. ';
// Small on screen: simple silhouettes read better than detail.
const SMALL = 'Keep every subject small and simple with a clear readable silhouette and little fine detail, as if seen from a distance. ';
const GRID = (cols: number, rows: number) =>
  `Arrange them as a sprite sheet: a strict grid of ${cols} columns and ${rows} rows of equal cells, one subject per cell, ` +
  'each centred in its cell with empty space around it, nothing touching or crossing the cell borders, ' +
  'all on one perfectly plain flat even light grey background, no grid lines, no ground, no shadows, no text, no numbers.';

const SHEETS: Record<string, { prompt: string; aspect: string }> = {
  'beetle-walk': {
    prompt:
      STYLE +
      SMALL +
      'An 8-frame walk cycle animation of the same small black beetle, exact side profile facing right, same size and position in every frame, ' +
      'only the six legs change from frame to frame, alternating tripod gait, frame 8 leads back into frame 1. ' +
      GRID(4, 2),
    aspect: '16:9',
  },
  'snail-crawl': {
    prompt:
      STYLE +
      SMALL +
      'An 8-frame crawl cycle animation of the same small snail with a mossy amber shell, exact side profile facing right, same size in every frame, ' +
      'the soft body stretches forward and contracts, the eye stalks sway slightly, frame 8 leads back into frame 1. ' +
      GRID(4, 2),
    aspect: '16:9',
  },
  'mushroom-grow': {
    prompt:
      STYLE +
      SMALL +
      'An 8-frame growth sequence of the same red fly agaric toadstool, side view, standing on the same spot at the bottom of each cell: ' +
      'a tiny white egg-shaped button, then breaking open, a closed round cap rising, the cap opening up, until a fully open flat cap. ' +
      GRID(4, 2),
    aspect: '16:9',
  },
  'mushroom-variety': {
    prompt:
      STYLE +
      SMALL +
      '16 different small forest mushrooms and toadstools, side view, each a different species, shape and colour: ' +
      'fly agarics, pale bonnets, chanterelles, puffballs, ink caps, porcini, tiny glowing cyan ones, clusters and single ones. ' +
      GRID(4, 4),
    aspect: '1:1',
  },
  'critter-variety': {
    prompt:
      STYLE +
      SMALL +
      '12 different small forest floor creatures, each in exact side profile facing right: ' +
      'ant, beetle, woodlouse, snail, slug, ladybird, centipede, spider, earthworm, cricket, moth with folded wings, tiny frog. ' +
      GRID(4, 3),
    aspect: '4:3',
  },
};

const MODELS = {
  'bytedance/seedream-5-lite': (prompt: string, aspect: string) => ({ prompt, image_input: [ref], aspect_ratio: aspect }),
  'google/nano-banana-2': (prompt: string, aspect: string) => ({ prompt, image_input: [ref], aspect_ratio: aspect, output_format: 'png' }),
};

const jobs = Object.entries(SHEETS).flatMap(([name, s]) =>
  Object.entries(MODELS).map(([model, input]) => async () => {
    const files = await run(model, input(s.prompt, s.aspect), { step: '2b-sheets', name: `${name}-${model.split('/')[1]}` });
    return { name, model, file: files[0]! };
  }),
);

// Seedream can also make a series of related images on its own: one frame per image instead of a grid.
jobs.push(async () => {
  const prompt =
    STYLE +
    SMALL +
    'Frames of a walk cycle of one small black beetle, exact side profile facing right, same size and position in every image, ' +
    'only the legs move, on a plain flat light grey background, no ground, no shadow. Make 6 images, one per frame.';
  const files = await run(
    'bytedance/seedream-5-lite',
    { prompt, image_input: [ref], aspect_ratio: '1:1', sequential_image_generation: 'auto', max_images: 6 },
    { step: '2b-sheets', name: 'beetle-series-seedream-5-lite', cost: 6 * 0.035 },
  );
  return { name: 'beetle-series', model: 'bytedance/seedream-5-lite', file: files.join('\n') };
});

const results = (await pool(jobs, 6)).filter((r) => r !== undefined);

for (const name of Object.keys(SHEETS)) {
  const tiles = results.filter((r) => r.name === name).map((r) => ({ file: r.file, label: r.model }));
  console.log(await contact(join(SAMPLES, '2b-sheets', `sheet-${name}.webp`), `sprite sheet: ${name}`, tiles, { cols: 2 }));
}
const series = results.find((r) => r.name === 'beetle-series');
if (series) {
  const files = series.file.split('\n');
  console.log(
    await contact(
      join(SAMPLES, '2b-sheets', 'sheet-beetle-series.webp'),
      `seedream sequential series: ${files.length} images`,
      files.map((file, i) => ({ file, label: `frame ${i + 1}` })),
      { cols: 6 },
    ),
  );
}
console.log(`spent so far: $${spent().toFixed(3)}`);
