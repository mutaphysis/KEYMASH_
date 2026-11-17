// MYCELIUM_'s canopy, read from the text: a crown of canopy pieces over each tree's trunk, and the season the leaves
// are in. Pure and DOM-free. The view never goes above the trees, so only a crown's underside shows: the hanging
// edges of a few pieces at different heights, the ones further back higher up and wider, wide enough that the crowns
// close over the forest. A crown is drawn whole, back trees first, so a tree in front hides its neighbours' crowns
// where they meet. No crown is symmetric: it leans to one side, each piece is wider on one side than the other, its
// underside rounder or flatter and wobbling, and one bough hangs lower than the rest.
import type { Tree } from './trees';
import { TREE_SCALE, TREES_MAX } from './trees';

/** One canopy piece. Its tree, and how far back within its crown it lies (0 furthest, LAYERS - 1 in front). Then,
 * relative to the top of its tree's trunk and in the library's units (render.ts scales them by TREE_SCALE, whatever
 * its tree's own size: a smaller tree's crown is as wide as any), x right,
 * y up: its centre's x, the y of its lowest point, its width left and right of the centre, the height of its
 * underside, how round that is (the exponent of a superellipse: 2 an ellipse, more flatter, less pointier), and where
 * its outline's wobble starts. Above its centre its sides run straight up, out of the world. */
export interface Piece {
  tree: number;
  layer: number;
  /** drawn before its tree's trunk, so the trunk passes in front of it */
  behind: boolean;
  dx: number;
  bottom: number;
  left: number;
  right: number;
  ry: number;
  round: number;
  wobble: number;
}

export interface Crown {
  /** in drawing order: tree by tree from the back (Tree.depth), each crown's pieces behind its trunk, then the rest,
   * each group back to front */
  pieces: Piece[];
  /** the forest's season: 0 summer green, 1 turning, 2 the peak of autumn's colours, 3 the dry leaves of winter; in
   * between mixes neighbours */
  season: number;
  /** each tree's own season (treeSeason), by tree */
  seasons: number[];
}

/** per piece of a crown, back to front: its layer, centre x and how far it may stray, lowest point, half width
 * from … to. Further back is higher and wider, so every layer's hanging edge shows under the one behind it */
const PLAN: [layer: number, x: number, jx: number, y: number, w0: number, w1: number][] = [
  [0, 0, 90, 180, 720, 860],
  [1, -360, 90, 55, 380, 500],
  [1, 340, 90, 55, 380, 500],
  [2, -150, 70, -80, 280, 380],
  [2, 230, 70, -80, 280, 380],
  [3, 30, 90, -185, 230, 310],
];
/** about this share of crowns also hang a lobe low down between their trunk and a neighbour's, so the canopy isn't all
 * above the trunks: its lowest point this far under the trunk's top, its half width this share of the gap but at least
 * LOBE_MIN (as wide as the front piece: a narrower underside curves so tightly that the strip hanging along its normal
 * fans out and smears its leaves), its centre this share of the way to the neighbour. It is its crown's first piece:
 * its sides run up out of the world like any piece's, so the rest of its crown covers all of it but the end hanging
 * below them */
const LOBE_CHANCE = 0.55;
const LOBE_Y: [number, number] = [-420, -250];
const LOBE_W: [number, number] = [0.36, 0.44];
const LOBE_MIN = 230;
const LOBE_AT: [number, number] = [0.45, 0.55];
/** at most this many pieces in a canopy (the shaders' arrays are this long); how many layers deep a crown is */
export const CROWN_PIECES = (PLAN.length + 1) * TREES_MAX;
export const LAYERS = 4;
/** the canopy strip's dense band reaches about 100 view units inside a piece's outline: its underside's sharpest bend
 * (at the sides, about ry² / width for an ellipse) must stay wider than that, or the strip's inner edge folds over */
const MIN_BEND = 160;
/** how far ahead of the season each kind of leaves (trees.ts: LEAVES) turns: birch and maple early, oak late */
const LEAF_LAG = [0.25, -0.4, 0, 0.2];
/** how far a tree's own pace (Tree.pace, ±1) moves it off the season in autumn */
const PACE = 0.5;

/** tree t's season in the forest's `season`: its kind of leaves and its own pace turn it earlier or later. In autumn
 * a lot (a green tree beside a red one), in summer and winter only a little */
export function treeSeason(season: number, t: Tree): number {
  const autumn = smooth(0.3, 1, season) * (1 - smooth(2.4, 2.9, season));
  return Math.max(0, Math.min(3, season + (0.3 + 0.7 * autumn) * (LEAF_LAG[t.leaves]! + PACE * t.pace)));
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** how far past the world's edge the back piece of the tree at either end reaches, a share of its width (its U rises
 * toward its sides: at the edge it should still hang low) */
const PAST_EDGE = 0.5;
/** how far a trunk's lean moves its top, at most, in crown units (trees.ts: tilt, scale and stretch) */
const TILT_SLACK = 70;
/** how many crowns have one of their lower pieces behind the trunk: the trunk rises in front of some leaves and behind
 * others, as a real one does, instead of its crown sitting on it like a lid. The pieces further up (layers 0 and 1)
 * are behind it in every crown; they hang no lower than its top, so only a lobe shows that */
const BEHIND_CHANCE = 0.7;

/** the canopy over `trees`, which stand between x0 and x1, from its own random stream (`r` gives 0 … 1) */
export function readCrown(r: () => number, trees: Tree[], x0: number, x1: number): Crown {
  const span = (a: number, b: number) => a + (b - a) * r();
  const pieces: Piece[] = [];
  trees.forEach((t, tree) => {
    // the crown leans one way, mirrored half the time; one of the middle pieces hangs a bough lower than the rest
    const side = r() < 0.5 ? -1 : 1;
    const lean = span(40, 130) * side;
    const low = r() < 0.5 ? 3 : 4;
    const back = r() < BEHIND_CHANCE ? (r() < 0.5 ? 3 : 4) : -1;
    // the whole crown sits higher or lower on its trunk; at its highest the front piece's body still covers the
    // trunk's cut top
    const rise = span(-30, 70);
    /** a piece of `w` half width centred at dx, wider toward the lean; its sides reaching at least `reach` */
    const add = (layer: number, behind: boolean, dx: number, bottom: number, w: number, reach: [number, number] = [0, 0]) => {
      const skew = span(0.05, 0.3) * side;
      const left = Math.max(w * (1 - skew), reach[0]);
      const right = Math.max(w * (1 + skew), reach[1]);
      const round = span(1.7, 2.5);
      const ry = Math.max(w * span(0.38, 0.55), Math.sqrt(MIN_BEND * Math.max(left, right)) * (round > 2 ? round / 2 : 1));
      pieces.push({ tree, layer, behind, dx, bottom, left, right, ry, round, wobble: span(0, 6.3) });
    };
    // now and then a lobe hanging low in the gap toward a neighbour
    const toward = trees[tree + (r() < 0.5 ? -1 : 1)] ?? trees[tree - 1] ?? trees[tree + 1];
    if (toward && r() < LOBE_CHANCE) {
      const gap = (toward.x - t.x) / TREE_SCALE;
      const w = Math.max(LOBE_MIN, Math.abs(gap) * span(...LOBE_W));
      add(0, true, gap * span(...LOBE_AT), span(...LOBE_Y) + rise, w);
    }
    PLAN.forEach(([layer, x, jx, y, w0, w1], i) => {
      const w = span(w0, w1);
      const dx = side * x + lean * (0.4 + 0.6 * (i / PLAN.length)) + span(-jx, jx);
      // the trees at the ends carry the canopy out of the world, or sky shows past the last crown. In this crown's
      // units, from its centre; its trunk's lean moves the top by up to TILT_SLACK
      const reach: [number, number] = [
        layer === 0 && tree === 0 ? (t.x - x0) / TREE_SCALE + dx + TILT_SLACK + PAST_EDGE * w : 0,
        layer === 0 && tree === trees.length - 1 ? (x1 - t.x) / TREE_SCALE - dx + TILT_SLACK + PAST_EDGE * w : 0,
      ];
      add(layer, layer < 2 || i === back, dx, y + rise + span(-50, 50) - (i === low ? span(50, 110) : 0), w, reach);
    });
  });
  // tree by tree from the back; each crown's pieces behind its trunk first, then the rest, each back to front (the
  // sort is stable: PLAN's order within a layer)
  const depth = (p: Piece) => trees[p.tree]!.depth;
  pieces.sort((a, b) => depth(b) - depth(a) || a.tree - b.tree || +b.behind - +a.behind || a.layer - b.layer);
  // mostly summer, often autumn, now and then winter's dry leaves
  const pick = r();
  const season = pick < 0.45 ? span(0, 0.25) : pick < 0.85 ? span(0.8, 2.3) : span(2.75, 3);
  return { pieces, season, seasons: trees.map((t) => treeSeason(season, t)) };
}
