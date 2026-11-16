// Step 1, style search: the same prompts on several text-to-image models, one contact sheet.
// Usage: bun scripts/forest/1-style.ts

import { join } from 'node:path';
import { contact } from './contact';
import { pool, run, SAMPLES, spent } from './replicate';

export const LOOK =
  'photorealistic macro photograph with a slightly surreal storybook mood, everything overgrown with thick green moss and pale lichen, ' +
  'old gnarled bark, warm amber haze, soft diffuse backlight, shallow depth of field, rich textures, muted earthy palette';

const PROMPTS: Record<string, { prompt: string; aspect: string }> = {
  scene: {
    prompt:
      'A side-on cross-section of a magical forest floor: huge mossy tree roots, toadstools, a snail and a beetle on the moss, ' +
      'below the ground a dark soil layer full of glowing pale mycelium threads. ' +
      LOOK,
    aspect: '16:9',
  },
  stump: {
    prompt:
      'A single hollow mossy tree stump with shelf fungi, centred, isolated on a plain flat light grey background, no ground. ' + LOOK,
    aspect: '1:1',
  },
  mushrooms: {
    prompt:
      'A small cluster of three speckled toadstools with tall pale stems, centred, isolated on a plain flat light grey background. ' + LOOK,
    aspect: '1:1',
  },
  snail: {
    prompt: 'A garden snail with a spiral amber shell, side view, crawling, isolated on a plain flat light grey background. ' + LOOK,
    aspect: '1:1',
  },
};

const MODELS: Record<string, (prompt: string, aspect: string) => Record<string, unknown>> = {
  'bytedance/seedream-4.5': (prompt, aspect) => ({ prompt, aspect_ratio: aspect, size: '2K' }),
  'bytedance/seedream-5-lite': (prompt, aspect) => ({ prompt, aspect_ratio: aspect }),
  'google/nano-banana-2': (prompt, aspect) => ({ prompt, aspect_ratio: aspect, output_format: 'png' }),
  'black-forest-labs/flux-2-pro': (prompt, aspect) => ({ prompt, aspect_ratio: aspect, output_format: 'png' }),
};

const jobs = Object.entries(MODELS).flatMap(([model, input]) =>
  Object.entries(PROMPTS).map(([name, p]) => async () => ({
    model,
    name,
    files: await run(model, input(p.prompt, p.aspect), { step: '1-style', name: `${model.split('/')[1]}-${name}` }),
  })),
);
const results = (await pool(jobs, 6)).filter((r) => r !== undefined);

for (const name of Object.keys(PROMPTS)) {
  const tiles = results.filter((r) => r.name === name).map((r) => ({ file: r.files[0]!, label: r.model }));
  if (tiles.length) console.log(await contact(join(SAMPLES, '1-style', `sheet-${name}.webp`), `style search: ${name}`, tiles, { cols: 2 }));
}
console.log(`spent so far: $${spent().toFixed(3)}`);
