// MYCELIUM_'s ground, read from the text: the curve of the forest floor and where the soil horizons lie.
// Pure and DOM-free. Any text gives a ground (the same text always the same one); every field is a number,
// so one ground can ease into another while the program is edited.
import { hash, mulberry32 } from '../../lang/rng';

/** The world in view units (3.75 per cm, the assets' scale, ASSETS.md); y up, the forest floor near y = 0. 10 m wide. */
export const WORLD = { x0: -1875, x1: 1875, top: 1100, bottom: -2200 } as const;

export interface Ground {
  /** gentle swells, long to short: amplitude, frequency (per unit), phase */
  waves: [number, number, number][];
  /** mounds (height > 0) and hollows: centre x, width, height */
  bumps: [number, number, number][];
  /** depths below the surface where leafy humus turns dark, dark turns plain, plain turns stony */
  bands: [number, number, number];
  /** where the noise that makes horizon borders wander and tones the soil is read: a different place per text */
  drift: [number, number];
  /** how thick the moss is along the floor, as waves around 1 (the strip as photographed): amplitude, frequency, phase */
  moss: [number, number, number][];
  /** the mossy hill behind the floor: its waves (amplitude, frequency, phase), how far they reach (view units per unit
   * of normalised wave) and the wave level at the floor, so the hill shows over it RIDGE_SHOWS of the way */
  ridge: [number, number, number][];
  ridgeAmp: number;
  ridgeLevel: number;
}

/** how much of the floor's length the hill behind it shows over it, and how far above the floor it rises at most
 * (about 11 cm: its moss band in render.ts, RIDGE_STRETCH, must still reach down behind the floor's moss) */
export const RIDGE_SHOWS = 0.3;
export const RIDGE_RISE = 40;

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
  for (let i = 0; i < 5; i++) {
    const w = span(90, 260);
    // at most this steep, so the strip hanging from the curve doesn't fold over
    bumps.push([span(WORLD.x0, WORLD.x1), w, sign() * span(0.1, 0.3) * w]);
  }
  const b0 = span(190, 250);
  const b1 = b0 + span(90, 170);
  const b2 = b1 + span(120, 240);
  const drift: [number, number] = [span(-500, 500), span(-500, 500)];
  const moss: [number, number, number][] = [
    [span(0.18, 0.3), span(0.0018, 0.0035), span(0, 6.3)],
    [span(0.08, 0.14), span(0.007, 0.012), span(0, 6.3)],
  ];
  const ridge: [number, number, number][] = [
    [1, span(0.004, 0.006), span(0, 6.3)],
    [span(0.3, 0.5), span(0.009, 0.013), span(0, 6.3)],
  ];
  // the level the hill's waves top RIDGE_SHOWS of the way, and the reach that puts its highest crest RIDGE_RISE up
  const ws: number[] = [];
  for (let x = WORLD.x0; x <= WORLD.x1; x += 4) ws.push(ridgeWave(ridge, x));
  ws.sort((a, b) => a - b);
  const ridgeLevel = ws[Math.floor((1 - RIDGE_SHOWS) * (ws.length - 1))]!;
  const ridgeAmp = RIDGE_RISE / Math.max(0.05, ws[ws.length - 1]! - ridgeLevel);
  return { waves, bumps, bands: [b0, b1, b2], drift, moss, ridge, ridgeAmp, ridgeLevel };
}

/** the hill's waves at x, normalised to -1 … 1 */
function ridgeWave(ridge: [number, number, number][], x: number): number {
  let w = 0;
  let sum = 0;
  for (const [a, f, p] of ridge) {
    w += a * Math.sin(x * f + p);
    sum += a;
  }
  return w / sum;
}

/** the top of the mossy hill behind the floor at x: the floor's curve, raised and lowered by larger waves */
export function ridgeAt(g: Ground, x: number): number {
  return heightAt(g, x) + g.ridgeAmp * (ridgeWave(g.ridge, x) - g.ridgeLevel);
}

/** the top of the forest floor at x */
export function heightAt(g: Ground, x: number): number {
  let y = 0;
  for (const [a, f, p] of g.waves) y += a * Math.sin(x * f + p);
  for (const [c, w, h] of g.bumps) y += h * Math.exp(-(((x - c) / w) ** 2));
  return y;
}

/** how thick the moss is at x: 1 as photographed, MOSS_RANGE at the extremes (it is stretched, so not much further) */
export const MOSS_RANGE = [0.6, 1.45] as const;
export function mossAt(g: Ground, x: number): number {
  let s = 1;
  for (const [a, f, p] of g.moss) s += a * Math.sin(x * f + p);
  return Math.max(MOSS_RANGE[0], Math.min(MOSS_RANGE[1], s));
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
    moss: a.moss.map((w, i) => row(w, b.moss[i]!)),
    ridge: a.ridge.map((w, i) => row(w, b.ridge[i]!)),
    ridgeAmp: m(a.ridgeAmp, b.ridgeAmp),
    ridgeLevel: m(a.ridgeLevel, b.ridgeLevel),
  };
}
