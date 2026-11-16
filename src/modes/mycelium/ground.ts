// MYCELIUM_'s ground, read from the text: the curve of the forest floor and where the soil horizons lie.
// Pure and DOM-free. Any text gives a ground (the same text always the same one); every field but what lies buried
// is a number, so one ground can ease into another while the program is edited.
import { hash, mulberry32 } from '../../lang/rng';
import { readBuried } from './buried';
import type { Buried } from './buried';

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
  /** the mossy hill behind the floor: its cushions (centre x, half width left, half width right, top y): each a dome
   * standing RIDGE_RISE-ish over the floor at its centre, the hill between them sunk well under the floor */
  ridge: [number, number, number, number][];
  /** treasure and stones in the soil (buried.ts); an edit swaps them for the new ones instead of easing them */
  buried: Buried[];
}

/** how many view units apart the hill's cushions stand, how far they rise over the floor, how tall a dome is from
 * its foot (taller than it shows: only its rounded top clears the floor) */
export const RIDGE_SPACING = 650;
export const RIDGE_RISE = 80;
const RIDGE_DOME = 200;
/** where two cushions meet, their outlines round into each other over about this many view units */
const RIDGE_MERGE = 12;

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
  // moss cushions of a similar size, spaced a little unevenly, each a little lopsided; each top stands about
  // RIDGE_RISE over the floor under it, so they all show, as rounded caps
  const ridge: [number, number, number, number][] = [];
  const n = Math.round((WORLD.x1 - WORLD.x0) / RIDGE_SPACING) + 2; // one more past each side
  const centres: number[] = [];
  for (let i = 0; i < n; i++) {
    const c = WORLD.x0 + (i - 0.5 + span(-0.25, 0.25)) * RIDGE_SPACING;
    centres.push(c);
    ridge.push([c, span(172, 218), span(172, 218), heightAt({ waves, bumps }, c) + RIDGE_RISE * span(0.85, 1.15)]);
  }
  // between two of them one more, smaller and lower: the hill stays bumpy instead of running flat between the big
  // ones (always one per gap, so every ground has as many cushions and can ease into another)
  for (let i = 0; i + 1 < n; i++) {
    const c = centres[i]! + (centres[i + 1]! - centres[i]!) * span(0.4, 0.6);
    ridge.push([c, span(126, 167), span(126, 167), heightAt({ waves, bumps }, c) + RIDGE_RISE * span(0.25, 0.6)]);
  }
  // its own random stream, so the ground's shape doesn't change with how many tries the scattering takes
  const buried = readBuried(mulberry32(hash(src) ^ 0x9e3779b9), [b0, b1, b2], WORLD.x0, WORLD.x1);
  return { waves, bumps, bands: [b0, b1, b2], drift, moss, ridge, buried };
}

/** cushion i's dome at x: its top, falling RIDGE_DOME to its foot as an ellipse over its half widths, so it ends at
 * its edges even where the floor in front dips */
function dome([c, wl, wr, top]: [number, number, number, number], x: number): number {
  const d = (x - c) / (x < c ? wl : wr);
  return top - RIDGE_DOME * (1 - Math.sqrt(Math.max(0, 1 - d * d)));
}

/**
 * The top of the mossy hill behind the floor at x: its cushions' domes over a base sunk well under the floor (the
 * floor's long swells, a dome's height down), joined by a smooth maximum, so cushions nestle against each other
 * with a soft crease instead of adding up into one lump with a dip on top.
 */
export function ridgeAt(g: Ground, x: number): number {
  let base = -RIDGE_DOME;
  for (const [a, f, p] of g.waves) base += a * Math.sin(x * f + p);
  let top = base;
  for (const r of g.ridge) top = Math.max(top, dome(r, x));
  let sum = Math.exp((base - top) / RIDGE_MERGE);
  for (const r of g.ridge) sum += Math.exp((dome(r, x) - top) / RIDGE_MERGE);
  return top + RIDGE_MERGE * Math.log(sum);
}

/** the top of the forest floor at x */
export function heightAt(g: Pick<Ground, 'waves' | 'bumps'>, x: number): number {
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
    buried: k < 0.5 ? a.buried : b.buried,
  };
}
