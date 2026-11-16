// Step 2, style lock: an asset set made with the user's reference picture as style reference,
// each asset alone on flat grey so it cuts out cleanly (step 3). Side views, so animals can crawl.
// Usage: bun scripts/forest/2-assets.ts [reference.webp]

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { contact } from './contact';
import { dataUrl, pool, run, SAMPLES, spent } from './replicate';

export const REF = process.argv[2] ?? join(import.meta.dir, 'reference.webp');
if (!existsSync(REF)) throw new Error(`style reference missing: ${REF}`);

// Step 1 showed: "everything overgrown" in the look makes models add a mossy ground under every asset.
// So the look talks about the subject only, and the isolation is stated twice.
const STYLE =
  'Match the look of the reference image exactly: photorealistic, slightly surreal storybook mood, thick green moss and pale lichen, ' +
  'gnarled bark, warm amber tones, soft light from the upper left. ';
const ALONE =
  ' Show only this one subject, complete and uncropped, centred, on a perfectly plain flat even light grey studio background. ' +
  'No ground, no moss carpet, no other objects, no glow or halo behind it, no text.';

export const ASSETS: Record<string, string> = {
  trunk:
    'A tall straight old tree trunk with flaring mossy roots, seen from the side, the top cut off by nothing, the whole trunk visible.',
  stump: 'A hollow mossy tree stump with a dark opening and bracket fungi on its side, side view.',
  roots: 'A twisted mossy tree root arching like a bridge, side view, both ends visible.',
  log: 'A fallen mossy log lying horizontally, side view, with a few tiny mushrooms on top.',
  rock: 'A rounded boulder covered in moss and pale lichen, side view.',
  amanita: 'A single tall red fly agaric toadstool with white spots, side view.',
  pale: 'A cluster of five thin pale bonnet mushrooms with long slender stems, side view.',
  glow: 'A cluster of small mushrooms that glow softly pale cyan from inside, bioluminescent, side view.',
  bracket: 'A stack of three wavy bracket fungi shelves, as if growing from a trunk, side view.',
  snail: 'A snail with a spiral amber shell that has tiny moss growing on it, exact side profile facing right, body fully extended.',
  beetle: 'A black stag beetle, exact side profile facing right, all six legs clearly visible and separated, antennae visible.',
  woodlouse: 'A grey woodlouse, exact side profile facing right, legs visible.',
  moth: 'A brown patterned moth with wings spread flat, seen from directly above.',
  backdrop:
    'A wide misty background of a deep old forest: distant tall trunks fading into warm amber fog, no foreground objects, nothing in the lower third but soft fog.',
};

const ref = dataUrl(REF);
const MODELS = {
  'bytedance/seedream-5-lite': (prompt: string, wide: boolean) => ({ prompt, image_input: [ref], aspect_ratio: wide ? '16:9' : '1:1' }),
  'google/nano-banana-2': (prompt: string, wide: boolean) => ({
    prompt,
    image_input: [ref],
    aspect_ratio: wide ? '16:9' : '1:1',
    output_format: 'png',
  }),
};
// The expensive model only on a few assets, to compare.
const COMPARE = ['stump', 'amanita', 'snail', 'beetle'];

const jobs = Object.entries(ASSETS).flatMap(([name, what]) =>
  Object.entries(MODELS)
    .filter(([model]) => model.includes('seedream') || COMPARE.includes(name))
    .map(([model, input]) => async () => {
      const wide = name === 'backdrop';
      const prompt = STYLE + what + (wide ? ' No text.' : ALONE);
      const files = await run(model, input(prompt, wide), { step: '2-assets', name: `${name}-${model.split('/')[1]}` });
      return { name, model, file: files[0]! };
    }),
);
const results = (await pool(jobs, 6)).filter((r) => r !== undefined);

const sd = results.filter((r) => r.model.includes('seedream'));
console.log(
  await contact(
    join(SAMPLES, '2-assets', 'sheet-seedream.webp'),
    'asset set, seedream-5-lite + reference',
    sd.map((r) => ({ file: r.file, label: r.name })),
    { cols: 5 },
  ),
);
const cmp = COMPARE.flatMap((n) => results.filter((r) => r.name === n)).map((r) => ({ file: r.file, label: `${r.name} · ${r.model}` }));
console.log(await contact(join(SAMPLES, '2-assets', 'sheet-compare.webp'), 'seedream-5-lite vs nano-banana-2', cmp, { cols: 4 }));
console.log(`spent so far: $${spent().toFixed(3)}`);
