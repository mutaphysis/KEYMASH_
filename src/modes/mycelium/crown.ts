// MYCELIUM_'s canopy, read from the text: a few canopy pieces over each tree's trunk, and the season the leaves are
// in. Pure and DOM-free. The view never goes above the trees, so only the canopy's underside shows: the hanging edges
// of pieces at different heights, the ones further back higher up and wider, a tree's back piece reaching over its
// neighbours' so the canopy closes over the forest. No crown is symmetric: it leans to one side, each piece is wider
// on one side than the other, its underside rounder or flatter and wobbling, and now and then a bough hangs lower.
import type { Tree } from './trees';
import { TREES_MAX } from './trees';

/** One canopy piece. Its tree, and how far back it lies (0 furthest, LAYERS - 1 in front). Then, relative to the top
 * of its tree's trunk and in that tree's units (render.ts scales them with the tree), x right, y up: its centre's x,
 * the y of its lowest point, its width left and right of the centre, the height of its underside, how round that is
 * (the exponent of a superellipse: 2 an ellipse, more flatter, less pointier), and where its outline's wobble starts.
 * Above its centre its sides run straight up, out of the world. */
export interface Piece {
  tree: number;
  layer: number;
  dx: number;
  bottom: number;
  left: number;
  right: number;
  ry: number;
  round: number;
  wobble: number;
}

export interface Crown {
  /** back to front: drawn in this order (every tree's back piece, then the middle ones, then the front ones) */
  pieces: Piece[];
  /** the leaves' colour: 0 summer green, 1 yellow, 2 red and orange, 3 the brown of dry leaves in winter; in between
   * mixes neighbours */
  season: number;
}

/** pieces per tree, and at most this many in a canopy (the shaders' arrays are this long); how many layers deep */
const PER_TREE = 3;
export const CROWN_PIECES = PER_TREE * TREES_MAX;
export const LAYERS = 4;
/** the canopy strip's dense band reaches about 100 view units inside a piece's outline: its underside's sharpest bend
 * (at the sides, about ry² / width for an ellipse) must stay wider than that, or the strip's inner edge folds over */
const MIN_BEND = 160;

/** the canopy over `trees`, from its own random stream (`r` gives 0 … 1) */
export function readCrown(r: () => number, trees: Tree[]): Crown {
  const span = (a: number, b: number) => a + (b - a) * r();
  const pieces: Piece[] = [];
  trees.forEach((_, tree) => {
    // per piece: its layer, centre x and how far it may stray, lowest point, half width from … to. The back piece is
    // wide enough to reach well over the neighbours' (trees stand about 280–390 of their units apart); the middle one
    // hangs off to one side, in either middle layer; the front one is lowest and centred, so its body covers the
    // trunk's cut top
    const side = r() < 0.5 ? -1 : 1;
    const plan: [number, number, number, number, number, number][] = [
      [0, 0, 80, 180, 380, 480],
      [r() < 0.5 ? 1 : 2, span(140, 240), 50, span(-60, 55), 210, 290],
      [3, 0, 25, -185, 160, 220],
    ];
    // the crown leans one way; sometimes its middle bough hangs lower than the rest
    const lean = span(30, 90) * side;
    const drop = r() < 0.35 ? span(50, 110) : 0;
    // the whole crown sits higher or lower on its trunk; at its highest the front piece's body still covers the
    // trunk's cut top
    const rise = span(-150, 60);
    plan.forEach(([layer, x, jx, y, w0, w1], i) => {
      const w = span(w0, w1);
      // wider toward the lean
      const skew = span(0.05, 0.3) * side;
      const left = w * (1 - skew);
      const right = w * (1 + skew);
      const round = span(1.7, 2.5);
      const ry = Math.max(w * span(0.38, 0.55), Math.sqrt(MIN_BEND * Math.max(left, right)) * (round > 2 ? round / 2 : 1));
      pieces.push({
        tree,
        layer,
        // the front piece leans least: it has to stay over the trunk
        dx: side * x + lean * (i === 2 ? 0.3 : 0.5 + 0.5 * i) + span(-jx, jx),
        bottom: y + rise + span(-40, 40) - (i === 1 ? drop : 0),
        left,
        right,
        ry,
        round,
        wobble: span(0, 6.3),
      });
    });
  });
  // back to front; within a layer left to right
  pieces.sort((a, b) => a.layer - b.layer || a.tree - b.tree);
  // mostly summer, often autumn, now and then winter's dry brown
  const pick = r();
  const season = pick < 0.45 ? span(0, 0.25) : pick < 0.85 ? span(0.8, 2.3) : span(2.75, 3);
  return { pieces, season };
}
