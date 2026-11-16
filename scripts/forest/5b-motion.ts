// Step 5b: a beetle that really walks (no fixed last frame, the camera follows it), a loop cut out of it
// automatically, video matting for clips on grey, and wan-alpha (text-to-video with native alpha).
// Usage: bun scripts/forest/5b-motion.ts

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { dataUrl, PRICE, pool, run, SAMPLES, spent } from './replicate';

PRICE['wan-video/wan-2.2-i2v-fast'] = 0.1;
PRICE['sprited/birefnet-video'] = 0.1;
PRICE['atonamy/wan-alpha'] = 0.15;

const OUT = join(SAMPLES, '5b-motion');
mkdirSync(OUT, { recursive: true });

const [walk, alpha, popMatte] = await pool(
  [
    async () =>
      (
        await run(
          'wan-video/wan-2.2-i2v-fast',
          {
            image: dataUrl(join(SAMPLES, '2-assets', 'beetle-nano-banana-2.png')),
            prompt:
              'The beetle walks steadily forward to the right with a clear alternating tripod gait, all six legs stepping. ' +
              'The camera tracks along with it so the beetle stays centred in the frame at the same size. Plain flat grey background.',
            resolution: '480p',
            num_frames: 81,
            frames_per_second: 16,
          },
          { step: '5b-motion', name: 'beetle-walk' },
        )
      )[0]!,
    async () =>
      (
        await run(
          'atonamy/wan-alpha',
          {
            prompt:
              'A small black beetle with moss on its back walks to the right across the frame, exact side view, legs stepping, ' +
              'photorealistic macro, transparent background.',
            num_frames: 49,
            output_format: 'webm',
          },
          { step: '5b-motion', name: 'beetle-alpha' },
        )
      )[0]!,
    async () =>
      (
        await run(
          'sprited/birefnet-video',
          { video: dataUrl(join(SAMPLES, '5-video', 'pop-wan.mp4')), output_format: 'cutout', video_output_type: 'webm' },
          { step: '5b-motion', name: 'pop-matte' },
        )
      )[0]!,
  ],
  3,
);

/** The pair of frames (at least `min` apart) that look most alike: a cut there loops best. */
async function loopPoint(video: string, min = 8): Promise<{ a: number; b: number; err: number }> {
  const S = 48;
  const raw = new Uint8Array(await Bun.$`ffmpeg -loglevel error -i ${video} -vf scale=${S}:${S},format=gray -f rawvideo -`.arrayBuffer());
  const n = raw.length / (S * S);
  let best = { a: 0, b: 0, err: Infinity };
  // Skip the first frames: the model's start frame is the still picture.
  for (let a = 8; a < n; a++)
    for (let b = a + min; b < n; b++) {
      let e = 0;
      for (let k = 0; k < S * S; k++) {
        const d = raw[a * S * S + k]! - raw[b * S * S + k]!;
        e += d * d;
      }
      e /= S * S;
      if (e < best.err) best = { a, b, err: e };
    }
  return best;
}

if (walk) {
  const lp = await loopPoint(walk);
  console.log(`beetle walk loop: frames ${lp.a}..${lp.b} (${lp.b - lp.a} frames, mean squared error ${lp.err.toFixed(1)})`);
  const dir = join(OUT, 'walk-loop');
  mkdirSync(dir, { recursive: true });
  await Bun.$`ffmpeg -y -loglevel error -i ${walk} -vf "select='between(n\,${lp.a}\,${lp.b - 1})',scale=320:-2" -fps_mode vfr ${join(dir, '%03d.png')}`;
  await Bun.$`img2webp -loop 0 -lossy -q 70 -d 62 ${(await Array.fromAsync(new Bun.Glob(join(dir, '*.png')).scan())).sort()} -o ${join(OUT, 'beetle-walk-loop.webp')}`.quiet();
  await Bun.$`ffmpeg -y -loglevel error -i ${walk} -vf "select='between(n\,${lp.a}\,${lp.a + 7})',crop=iw:ih*0.4:0:ih*0.5,scale=480:-2,tile=2x4" -fps_mode vfr -frames:v 1 ${join(OUT, 'beetle-walk-legs.png')}`;
}
console.log({ walk, alpha, popMatte });
console.log(`spent so far: $${spent().toFixed(3)}`);
