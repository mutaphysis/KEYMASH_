// MYCELIUM_'s tree crown, read from the text: canopy pieces stacked over the tree's trunk, and the season its leaves
// are in. Pure and DOM-free. The view never goes above the trees, so only a crown's underside shows: the hanging
// edges of a few pieces at different heights, the ones further back higher up and wider. No crown is symmetric: it
// leans to one side, each piece is wider on one side than the other, its underside rounder or flatter and wobbling,
// and one bough hangs lower than the rest.

/** One canopy piece, relative to the top of the trunk, in the tree's units (render.ts scales them with the tree),
 * x right, y up: its centre's x, the y of its lowest point, its width left and right of the centre, the height of its
 * underside, how round that is (the exponent of a superellipse: 2 an ellipse, more flatter, less pointier), and where
 * its outline's wobble starts. Above its centre its sides run straight up, out of the world. */
export type Piece = [dx: number, bottom: number, left: number, right: number, ry: number, round: number, wobble: number];

export interface Crown {
  /** back to front: drawn in this order */
  pieces: Piece[];
  /** the leaves' colour: 0 summer green, 1 yellow, 2 red and orange, 3 the brown of dry leaves in winter; in between
   * mixes neighbours */
  season: number;
}

/** how many pieces a crown has (the shaders' arrays are this long), and how far back each lies: 0 furthest */
export const CROWN_PIECES = 6;
export const PIECE_LAYER = [0, 1, 1, 2, 2, 3] as const;
/** the canopy strip's dense band reaches about 100 view units inside a piece's outline: its underside's sharpest bend
 * (at the sides, about ry² / width for an ellipse) must stay wider than that, or the strip's inner edge folds over */
const MIN_BEND = 160;

/** the crown of a text, from its own random stream (`r` gives 0 … 1) */
export function readCrown(r: () => number): Crown {
  const span = (a: number, b: number) => a + (b - a) * r();
  // per piece: centre x and how far it may stray, lowest point, half width from … to; further back is higher and
  // wider, so every layer's hanging edge shows under the one behind it
  const plan: [number, number, number, number, number][] = [
    [0, 90, 180, 720, 860],
    [-360, 90, 55, 380, 500],
    [340, 90, 55, 380, 500],
    [-150, 70, -80, 280, 380],
    [230, 70, -80, 280, 380],
    [30, 90, -185, 230, 310],
  ];
  // the crown leans one way, mirrored half the time; one of the middle pieces hangs a bough lower than the rest
  const side = r() < 0.5 ? -1 : 1;
  const lean = span(40, 130) * side;
  const low = r() < 0.5 ? 3 : 4;
  // the whole crown sits higher or lower on its trunk; at its highest the front piece's body still covers the
  // trunk's cut top
  const rise = span(-170, 70);
  const pieces = plan.map(([x, jx, y, w0, w1], i): Piece => {
    const w = span(w0, w1);
    // wider toward the lean
    const skew = span(0.05, 0.3) * side;
    const left = w * (1 - skew);
    const right = w * (1 + skew);
    const round = span(1.7, 2.5);
    const ry = Math.max(w * span(0.38, 0.55), Math.sqrt(MIN_BEND * Math.max(left, right)) * (round > 2 ? round / 2 : 1));
    const drop = i === low ? span(50, 110) : 0;
    return [
      side * x + lean * (0.4 + 0.6 * (i / plan.length)) + span(-jx, jx),
      y + rise + span(-50, 50) - drop,
      left,
      right,
      ry,
      round,
      span(0, 6.3),
    ];
  });
  // mostly summer, often autumn, now and then winter's dry brown
  const pick = r();
  const season = pick < 0.45 ? span(0, 0.25) : pick < 0.85 ? span(0.8, 2.3) : span(2.75, 3);
  return { pieces, season };
}

/** a crown on its way from `a` to `b` (k 0 … 1) */
export function mixCrown(a: Crown, b: Crown, k: number): Crown {
  const m = (x: number, y: number) => x * (1 - k) + y * k;
  return {
    pieces: a.pieces.map((p, i) => p.map((v, j) => m(v, b.pieces[i]![j]!)) as Piece),
    season: m(a.season, b.season),
  };
}
