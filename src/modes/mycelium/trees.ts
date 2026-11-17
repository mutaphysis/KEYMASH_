// MYCELIUM_'s trees, read from the text: a row of trunks across the whole world, each standing in the floor, its crown
// over it (crown.ts). Pure and DOM-free. No two neighbours are the same picture or wear the same leaves, and each
// differs from the library's a little: mirrored, leaning, larger or smaller, its bark lighter, darker, warmer or
// greyer, its moss and patches read at a place of its own, its leaves a shade of their own in the forest's season.
import { frames } from './assets/manifest.json';

/** the trunks a forest is made of: tree frames of the library, each on a page of its own with its relief (assets.ts
 * fetches every one) */
export const TRUNKS = [
  'trees-a/03',
  'trunk-beech/00',
  'trunk-hornbeam/00',
  'trunk-oak/00',
  'trunk-forked/00',
  'trunks-row-a/00',
  'trunks-row-a/01',
  'trunks-row-a/02',
  'trunks-row-a/03',
  'trunks-row-a/04',
  'trunks-row-b/01',
  'trunks-row-b/02',
  'trunks-row-b/03',
  'trunks-row-b/04',
] as const satisfies readonly (keyof typeof frames)[];
export type TrunkFrame = (typeof TRUNKS)[number];

/** trees are drawn this much larger than the library's size: at that size one looked small beside the moss and the
 * hill. Their crowns (crown.ts, in a tree's units) grow with them; the leaves keep their size */
export const TREE_SCALE = 1.2;
/** how many trees a forest has, fewest to most (the renderer's buffers hold the most) */
export const TREES_MIN = 8;
export const TREES_MAX = 11;
/** a tree's picture differs from the pictures of this many trees to its left (about a zoomed-out screen's worth) */
const UNIQUE = 7;
/** the kinds of leaves a crown wears: the library's canopy strips (canopy-<kind>) and leaf fills (leaf-<index>), in
 * the same order */
export const LEAVES = ['birch', 'oak', 'beech', 'maple'] as const;

export interface Tree {
  /** where its foot stands */
  x: number;
  /** its picture: an index into TRUNKS */
  trunk: number;
  /** mirrored left to right */
  flip: boolean;
  /** how far it leans, radians: positive leans its top to the right */
  tilt: number;
  /** times TREE_SCALE times its library size */
  scale: number;
  /** its bark's colour: a gain per channel, and how saturated it is (1: as photographed) */
  tint: [number, number, number];
  saturation: number;
  /** where its noise is read (its moss cushions, its bark's patches), and how high its moss climbs (1: as usual) */
  seed: [number, number];
  climb: number;
  /** its crown's leaves: an index into LEAVES, and a gain per channel on their colour (the season is the forest's) */
  leaves: number;
  foliage: [number, number, number];
}

/** the trees of a text, from its own random stream (`r` gives 0 … 1), spread over x0 … x1 */
export function readTrees(r: () => number, x0: number, x1: number): Tree[] {
  const span = (a: number, b: number) => a + (b - a) * r();
  const n = TREES_MIN + Math.floor(r() * (TREES_MAX - TREES_MIN + 1));
  // one per slot, jittered within it: they fill the width evenly but never stand in a row like posts
  const slot = (x1 - x0) / n;
  const trees: Tree[] = [];
  // a zoomed-out screen shows about seven trees: none of them repeats a picture while the library has enough
  const recent: number[] = [];
  const unique = Math.min(UNIQUE, TRUNKS.length - 1);
  let lastLeaves = -1;
  for (let i = 0; i < n; i++) {
    const free = TRUNKS.map((_, k) => k).filter((k) => !recent.includes(k));
    const trunk = free[Math.floor(r() * free.length)]!;
    recent.push(trunk);
    if (recent.length > unique) recent.shift();
    // never the leaves its left neighbour has
    const leaves =
      lastLeaves < 0 ? Math.floor(r() * LEAVES.length) : (lastLeaves + 1 + Math.floor(r() * (LEAVES.length - 1))) % LEAVES.length;
    lastLeaves = leaves;
    const light = span(0.86, 1.1);
    const warm = span(-0.05, 0.06);
    // a crown a little lighter or darker than the next, a little warmer or cooler, a little greener or greyer
    const leafLight = span(0.9, 1.08);
    const leafWarm = span(-0.05, 0.05);
    const leafGreen = span(-0.04, 0.05);
    trees.push({
      x: x0 + (i + 0.5 + span(-0.22, 0.22)) * slot,
      trunk,
      flip: r() < 0.5,
      tilt: span(-0.045, 0.045),
      scale: span(0.9, 1.1),
      tint: [light * (1 + warm), light, light * (1 - warm)],
      saturation: span(0.75, 1.15),
      seed: [span(-300, 300), span(-300, 300)],
      climb: span(0.7, 1.35),
      leaves,
      foliage: [leafLight * (1 + leafWarm), leafLight * (1 + leafGreen), leafLight * (1 - leafWarm)],
    });
  }
  return trees;
}

/** a tree's picture in the library */
export const trunkFrame = (t: Tree) => frames[TRUNKS[t.trunk]!];
