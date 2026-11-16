// What lies buried under MYCELIUM_'s forest floor, read from the text: treasure (a chest, coins, pots, a sword…, raw
// gems) and stones, scattered through the soil horizons. Pure and DOM-free. Sizes come from the library's manifest
// (view units per texel), so a chest stays a chest and a pebble a pebble; nothing overlaps, nothing pokes up into
// the moss.
import { frames } from './assets/manifest.json';

export type BuriedFrame = keyof typeof frames;

export interface Buried {
  /** the picture in the library's atlases */
  frame: BuriedFrame;
  /** its centre: x in the world, view units below the forest floor */
  x: number;
  depth: number;
  /** times its size in the library, its turn (radians, counter-clockwise), mirrored left to right */
  scale: number;
  tilt: number;
  flip: boolean;
}

const sheet = (name: string) => Array.from({ length: 16 }, (_, i) => `${name}/${String(i).padStart(2, '0')}` as BuriedFrame);
/** treasure: the treasure sheet (a chest, coins, pots, an amphora, a sword, a dagger, a ring, a key…) and the crystals
 * sheet (raw gems: an amethyst geode, a ruby, an emerald, quartz, lapis…), each piece as likely as any other */
const TREASURE = [...sheet('treasure'), ...sheet('crystals')];
/** bare stones only: the ones with moss caps or lichen grew in the light (stones 05, 06, 09), plus the soil's pebbles */
const STONES: BuriedFrame[] = [
  'stones/00',
  'stones/01',
  'stones/02',
  'stones/03',
  'stones/04',
  'stones/07',
  'stones/08',
  'stones/10',
  'stones/11',
  'inclusions/00',
  'inclusions/01',
];

/** at most this many things buried in one ground (the renderer's buffers hold this many), at most this many treasures */
export const BURIED_MAX = 160;
export const TREASURE_MAX = 9;
/** no top comes closer to the floor than this: below the moss, where the strip is soil already (view units) */
const TOP = 150;
/** and no centre deeper than this: the world's bottom is about 2000 under the floor */
const DEEP = 1700;
/** tries for stones; each lands with its horizon's chance (leafy, dark, plain, stony: stones gather deep down) */
const STONE_TRIES = 420;
const STONE_CHANCE = [0.12, 0.3, 0.55, 1] as const;

/** the radius a frame needs at a scale, whatever its turn (half its diagonal), in view units */
export function reach(frame: BuriedFrame, scale: number): number {
  const f = frames[frame];
  return 0.5 * Math.hypot(f.w, f.h) * f.s * scale;
}

/**
 * Treasure and stones for a ground: `r` the text's own random stream, `bands` its horizon depths, the world's sides
 * x0 … x1. Treasure first (6–9 pieces, each a different one, shallow ones likelier, so some show from where the camera
 * starts), then stones around them, most in the stony horizon.
 */
export function readBuried(r: () => number, bands: readonly [number, number, number], x0: number, x1: number): Buried[] {
  const span = (a: number, b: number) => a + (b - a) * r();
  const out: Buried[] = [];
  const free = (x: number, depth: number, rad: number, gap: number) =>
    out.every((o) => Math.hypot(o.x - x, o.depth - depth) > rad + reach(o.frame, o.scale) + gap);
  const place = (frame: BuriedFrame, scale: number, tilt: number, gap: number, depth: (lo: number) => number): boolean => {
    const rad = reach(frame, scale);
    const lo = TOP + rad;
    if (lo >= DEEP) return false;
    const x = span(x0 + rad, x1 - rad);
    const d = Math.min(DEEP, depth(lo));
    if (!free(x, d, rad, gap)) return false;
    out.push({ frame, x, depth: d, scale, tilt: span(-tilt, tilt), flip: r() < 0.5 });
    return true;
  };

  // a shuffled pick of the treasure: each piece at most once
  const pick = [...TREASURE];
  for (let i = pick.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [pick[i], pick[j]] = [pick[j]!, pick[i]!];
  }
  const n = 6 + Math.floor(r() * (TREASURE_MAX - 5));
  for (let i = 0; i < n; i++) {
    // a few tries for a free spot, well apart from the others: finds, not a hoard
    for (let k = 0; k < 24; k++) if (place(pick[i]!, span(0.9, 1.1), 0.35, 90, (lo) => lo + (DEEP - lo) * r() ** 1.7)) break;
  }

  for (let i = 0; i < STONE_TRIES && out.length < BURIED_MAX; i++) {
    const frame = STONES[Math.floor(r() * STONES.length)]!;
    const d = span(TOP, DEEP);
    const h = d < bands[0] ? 0 : d < bands[1] ? 1 : d < bands[2] ? 2 : 3;
    if (r() >= STONE_CHANCE[h]) continue;
    place(frame, span(0.75, 1.3), 0.6, 10, (lo) => Math.max(lo, d));
  }
  return out;
}

/** treasure and gems: what gets a halo of disturbed earth */
export function isTreasure(frame: BuriedFrame): boolean {
  return frame.startsWith('treasure/') || isGem(frame);
}

/** gems keep their colour (the soil stains and shades them less) and now and then glint */
export function isGem(frame: BuriedFrame): boolean {
  return frame.startsWith('crystals/');
}
