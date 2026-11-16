// MYCELIUM_'s ground, read from the text: the curve of the forest floor and where the soil horizons lie.
// Pure and DOM-free. Any text gives a ground (the same text always the same one); every field is a number,
// so one ground can ease into another while the program is edited.
import { hash, mulberry32 } from '../../lang/rng';

/** The world in view units (3.75 per cm, the assets' scale, ASSETS.md); y up, the forest floor near y = 0. */
export const WORLD = { x0: -3200, x1: 3200, top: 1100, bottom: -2200 } as const;

export interface Ground {
  /** gentle swells, long to short: amplitude, frequency (per unit), phase */
  waves: [number, number, number][];
  /** mounds (height > 0) and hollows: centre x, width, height */
  bumps: [number, number, number][];
  /** depths below the surface where leafy humus turns dark, dark turns plain, plain turns stony */
  bands: [number, number, number];
  /** where the noise that makes horizon borders wander and tones the soil is read: a different place per text */
  drift: [number, number];
}

/** the ground of a text */
export function readGround(src: string): Ground {
  const r = mulberry32(hash(src));
  const span = (a: number, b: number) => a + (b - a) * r();
  const sign = () => (r() < 0.5 ? -1 : 1);
  const waves: [number, number, number][] = [
    [span(16, 30), span(0.0018, 0.003), span(0, 6.3)],
    [span(7, 14), span(0.006, 0.009), span(0, 6.3)],
    [span(2, 5), span(0.02, 0.03), span(0, 6.3)],
  ];
  const bumps: [number, number, number][] = [];
  for (let i = 0; i < 8; i++) {
    const w = span(90, 260);
    // at most this steep, so the strip hanging from the curve doesn't fold over
    bumps.push([span(WORLD.x0, WORLD.x1), w, sign() * span(0.1, 0.3) * w]);
  }
  const b0 = span(190, 250);
  const b1 = b0 + span(90, 170);
  const b2 = b1 + span(120, 240);
  return { waves, bumps, bands: [b0, b1, b2], drift: [span(-500, 500), span(-500, 500)] };
}

/** the top of the forest floor at x */
export function heightAt(g: Ground, x: number): number {
  let y = 0;
  for (const [a, f, p] of g.waves) y += a * Math.sin(x * f + p);
  for (const [c, w, h] of g.bumps) y += h * Math.exp(-(((x - c) / w) ** 2));
  return y;
}

/** a ground on its way from `a` to `b` (k 0 … 1); both from readGround, so their shapes match */
export function mixGround(a: Ground, b: Ground, k: number): Ground {
  const m = (x: number, y: number) => x * (1 - k) + y * k; // exactly a at 0, exactly b at 1
  const row = <T extends number[]>(x: T, y: T) => x.map((v, i) => m(v, y[i]!)) as T;
  return {
    waves: a.waves.map((w, i) => row(w, b.waves[i]!)),
    bumps: a.bumps.map((w, i) => row(w, b.bumps[i]!)),
    bands: row(a.bands, b.bands),
    drift: row(a.drift, b.drift),
  };
}
