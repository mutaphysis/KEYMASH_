// Step 5a, animation through image-to-video: the asset is both first and last frame, so the clip
// should loop; on flat grey it can be matted afterwards. A mushroom "pops out" from an empty frame.
// Usage: bun scripts/forest/5-video.ts

import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { contact } from './contact';
import { dataUrl, PRICE, pool, run, SAMPLES, spent } from './replicate';

// Replicate shows no prices for these to a script; guesses rounded up.
PRICE['wan-video/wan-2.2-i2v-fast'] = 0.1;
PRICE['bytedance/seedance-1-lite'] = 0.15;

const A = (f: string) => join(SAMPLES, '2-assets', f);
const OUT = join(SAMPLES, '5-video');
mkdirSync(OUT, { recursive: true });

// An empty grey frame in the asset's background colour, for the pop-up clip.
const empty = join(OUT, 'empty.png');
if (!existsSync(empty)) {
  await Bun.$`ffmpeg -y -loglevel error -i ${A('amanita-nano-banana-2.png')} -vf "crop=8:8:0:0,scale=1024:1024" -frames:v 1 ${empty}`;
}

const STILL = 'Static camera, the subject stays in the same place and size, plain flat grey background stays unchanged. ';
const CLIPS: Record<string, { first: string; last: string; prompt: string }> = {
  snail: {
    first: A('snail-nano-banana-2.png'),
    last: A('snail-nano-banana-2.png'),
    prompt: STILL + 'The snail crawls slowly on the spot: its soft body ripples and stretches forward, eye stalks sway gently.',
  },
  beetle: {
    first: A('beetle-nano-banana-2.png'),
    last: A('beetle-nano-banana-2.png'),
    prompt:
      STILL + 'The beetle walks on the spot like on a treadmill, its six legs stepping in a steady alternating gait, antennae twitching.',
  },
  pop: {
    first: empty,
    last: A('amanita-nano-banana-2.png'),
    prompt: STILL + 'A toadstool pushes up out of nothing, grows quickly and unfolds its red spotted cap, like a time-lapse.',
  },
  scene: {
    first: join(SAMPLES, '1-style', 'nano-banana-2-scene.png'),
    last: join(SAMPLES, '1-style', 'nano-banana-2-scene.png'),
    prompt:
      'Static camera. A living still: glowing pulses travel slowly along the mycelium threads in the soil, dust motes drift in the warm light, ' +
      'the snail and beetle move a little. Everything returns to how it started.',
  },
};

const jobs = Object.entries(CLIPS).map(([name, c]) => async () => {
  const [file] = await run(
    'wan-video/wan-2.2-i2v-fast',
    { image: dataUrl(c.first), last_image: dataUrl(c.last), prompt: c.prompt, resolution: '480p', num_frames: 81, frames_per_second: 16 },
    { step: '5-video', name: `${name}-wan` },
  );
  return { name: `${name}-wan`, file: file! };
});
jobs.push(async () => {
  const c = CLIPS.beetle!;
  const [file] = await run(
    'bytedance/seedance-1-lite',
    {
      image: dataUrl(c.first),
      last_frame_image: dataUrl(c.last),
      prompt: c.prompt,
      resolution: '480p',
      duration: 5,
      aspect_ratio: '1:1',
      camera_fixed: true,
    },
    { step: '5-video', name: 'beetle-seedance' },
  );
  return { name: 'beetle-seedance', file: file! };
});
const clips = (await pool(jobs, 5)).filter((r) => r !== undefined);

/** n evenly spaced frames of a clip as PNGs, for a contact sheet. */
export async function frames(video: string, dir: string, n: number): Promise<string[]> {
  mkdirSync(dir, { recursive: true });
  const dur = Number((await Bun.$`ffprobe -v error -show_entries format=duration -of csv=p=0 ${video}`.text()).trim());
  await Bun.$`ffmpeg -y -loglevel error -i ${video} -vf fps=${n / dur} ${join(dir, 'f-%02d.png')}`;
  return readdirSync(dir)
    .filter((f) => f.startsWith('f-'))
    .sort()
    .slice(0, n)
    .map((f) => join(dir, f));
}

for (const c of clips) {
  const list = await frames(c.file, join(OUT, 'frames', c.name), 8);
  console.log(
    await contact(
      join(OUT, `sheet-${c.name}.webp`),
      `${c.name}: 8 frames across the clip`,
      list.map((file) => ({ file })),
      { cols: 8 },
    ),
  );
}
console.log(`spent so far: $${spent().toFixed(3)}`);
