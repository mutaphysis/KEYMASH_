// Step 6, the kit for the composite prototype: the ground (a moss-and-soil strip, a soil texture),
// a sheet of trunks to build the backdrop from, and legless critter bodies whose legs are drawn
// procedurally (video and sprite-sheet walk cycles did not give readable legs, steps 2b and 5).
// Usage: bun scripts/forest/6-kit.ts

import { join } from 'node:path';
import { contact } from './contact';
import { dataUrl, pool, run, SAMPLES, spent } from './replicate';
import { closeSlicer, slice } from './slice';

const ref = dataUrl(join(SAMPLES, 'reference.webp'));
const STYLE =
  'In the look of the reference image: photorealistic but slightly surreal, mossy, warm amber tones, soft light from the upper left. ';
const GREY = 'Plain flat even light grey background, no text, no shadows.';

const KIT: Record<string, { prompt: string; aspect: string; cut: boolean; sheet: boolean }> = {
  ground: {
    prompt:
      STYLE +
      'A long horizontal slice of forest floor seen exactly from the side, spanning the full width edge to edge: ' +
      'on top a thick bumpy carpet of moss, tiny plants and a few fallen leaves, below it a band of dark brown soil with small stones and fine pale roots ' +
      'reaching down to the bottom edge of the image. Seamlessly tileable left and right edges. Above the moss: ' +
      GREY,
    aspect: '16:9',
    cut: true,
    sheet: false,
  },
  soil: {
    prompt:
      STYLE +
      'A seamlessly tileable flat texture of dark forest soil in cross-section, fine roots, small pebbles and crumbs, evenly lit, no perspective, ' +
      'fills the whole image, no objects.',
    aspect: '1:1',
    cut: false,
    sheet: false,
  },
  trunks: {
    prompt:
      STYLE +
      'Four different tall old tree trunks side by side, each the full height of the image from mossy flaring roots at the bottom to cut off at the top edge, ' +
      'one straight beech, one gnarled oak, one leaning with a hollow, one thin birch with lichen. Each separate with empty space between them. ' +
      GREY,
    aspect: '16:9',
    cut: true,
    sheet: true,
  },
  bodies: {
    prompt:
      STYLE +
      'Four small creature bodies WITHOUT ANY LEGS AND WITHOUT ANTENNAE, exact side profile facing right, like separate parts for a puppet: ' +
      'a black ground beetle with a little moss on its back, a grey woodlouse, a red-brown ant, a ladybird. ' +
      'Only head, thorax and abdomen. In a row with empty space between them. ' +
      GREY,
    aspect: '16:9',
    cut: true,
    sheet: true,
  },
  // "Without legs" alone turned the bodies into top-down views: say the camera angle twice.
  'bodies-side': {
    prompt:
      STYLE +
      'Lateral view: four insect specimens photographed exactly from the side at eye level, like a museum specimen photo, facing right, ' +
      'with their legs and antennae removed so only the body remains (head, thorax, abdomen seen from the side): ' +
      'a black ground beetle with a little moss on its back, a grey woodlouse, a red-brown ant, a ladybird. ' +
      'Seen from the side, not from above. In a row with empty space between them. ' +
      GREY,
    aspect: '16:9',
    cut: true,
    sheet: true,
  },
};

const results = await pool(
  Object.entries(KIT).map(([name, k]) => async () => {
    const [raw] = await run(
      'google/nano-banana-2',
      { prompt: k.prompt, image_input: [ref], aspect_ratio: k.aspect, output_format: 'png' },
      { step: '6-kit', name },
    );
    if (!k.cut) return { name, file: raw!, cells: [] as string[] };
    const [cut] = await run(
      '851-labs/background-remover',
      { image: dataUrl(raw!), format: 'png', background_type: 'rgba' },
      { step: '6-kit/cut', name },
    );
    const cells = k.sheet ? (await slice(cut!, join(SAMPLES, '6-kit', 'cells', name), name)).map((c) => c.file) : [];
    return { name, file: cut!, cells };
  }),
  4,
);
await closeSlicer();

const tiles = results
  .filter((r) => r !== undefined)
  .flatMap((r) => [{ file: r.file, label: r.name }, ...r.cells.map((file, i) => ({ file, label: `${r.name} ${i}` }))]);
console.log(
  await contact(join(SAMPLES, '6-kit', 'sheet-kit.webp'), 'prototype kit (nano-banana-2 + background-remover)', tiles, { cols: 4 }),
);
console.log(`spent so far: $${spent().toFixed(3)}`);
