// Step 4, layers: can a finished scene be split into RGBA layers for stacking (Samorost-like depth)?
// qwen/qwen-image-layered on the best step 1 scene.
// Usage: bun scripts/forest/4-layers.ts

import { join } from 'node:path';
import { contact } from './contact';
import { dataUrl, run, SAMPLES, spent } from './replicate';

const scene = join(SAMPLES, '1-style', 'nano-banana-2-scene.png');
const layers = await run(
  'qwen/qwen-image-layered',
  { image: dataUrl(scene), num_layers: 6, output_format: 'png' },
  { step: '4-layers', name: 'scene' },
);
console.log(
  await contact(
    join(SAMPLES, '4-layers', 'sheet-layers.webp'),
    'qwen-image-layered: nano-banana-2 scene → 6 layers (0 = back)',
    [{ file: scene, label: 'input' }, ...layers.map((file, i) => ({ file, label: `layer ${i}` }))],
    { cols: 4 },
  ),
);
console.log(`spent so far: $${spent().toFixed(3)}`);
