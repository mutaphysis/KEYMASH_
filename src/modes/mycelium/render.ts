// MYCELIUM_'s picture: a side view of the forest floor in WebGL2, panned in x and y. Layers are drawn back to
// front into a target sized by the pixel budget, then finished onto the canvas. That order is also each draw's depth:
// the canopy, all opaque, is drawn first, front to back, writing it (each piece's body, then its fringe of hanging
// leaves cut out at their edges), so each pixel is shaded by the nearest leaves only and everything behind them is
// skipped before it is shaded; the rest follows back to front:
//   sky     the air behind everything (full screen)
//   ridge   a mossy hill behind the floor: rounded moss cushions whose tops clear the floor (ground.ts, ridgeAt),
//           a second strip's moss band handing over to a hex-tiled moss carpet below
//   ground  the moss-and-soil strip bent along the curve, handing over to the hex-tiled soil horizons (one mesh)
//   trees   the forest (trees.ts, crown.ts), tree by tree from the back: each its trunk standing in the floor, its
//           foot sunk into the moss, the ground projected onto it and handed over in height blends (shaders/tree.frag),
//           between its crown's pieces (drawn already), each the canopy strip hanging along a U with the leaf fill for
//           its body, recoloured by the tree's season; trees further back smaller and fading into the air. The
//           canopy's shade on itself, the trunks, hill and floor is baked once per forest into the shade map
//   buried  treasure and stones in the soil (buried.ts): one quad each from the library's atlases, over a soft shadow
//   post    contrast, vignette, grain
//   wire    debug only (dev builds' wireframe button): every draw's edges, one colour per shader or material
// Shaders live in shaders/, one file per piece.
import { ATLASES, CANOPIES, CANOPY, LEAF_FILL, LEAF_FILLS, TREE_PAGES } from './assets';
import type { Assets, AtlasKey, Trunk } from './assets';
import { atlases, frames } from './assets/manifest.json';
import { BURIED_MAX, TREASURE_MAX, isGem, isTreasure } from './buried';
import { CROWN_OPAQUE, CROWN_PIECES } from './crown';
import { TREE_SCALE, TREES_MAX, trunkFrame } from './trees';
import type { Tree } from './trees';
import type { Buried } from './buried';
import { WORLD, heightAt, mixGround, mossAt, ridgeAt } from './ground';
import type { Ground } from './ground';
import { freeTarget, target, texture, textureArray, vao, vertexBuffer } from './gl';
import type { GL, Program, Target } from './gl';
import { programs } from './shaders';
import type { Programs } from './shaders';
import { PixelBudget } from '../../ui/budget';

type RGB = [number, number, number];
type RGBA = [number, number, number, number];

/** debug wireframe: one colour per shader or material (straight RGBA); `tris` per draw, as drawn */
export interface WireMaterial {
  name: string;
  color: RGBA;
  tris: number;
}
const WIRE_COLOR: Record<'sky' | 'band' | 'body' | 'tree' | 'crown' | 'strip' | 'soil' | 'halo' | 'buried' | 'post', RGBA> = {
  sky: [0.35, 0.8, 1, 0.9],
  band: [0.25, 1, 0.85, 0.85],
  body: [0.2, 0.55, 1, 0.85],
  tree: [1, 1, 1, 0.8],
  crown: [1, 0.45, 0.35, 0.85],
  strip: [0.55, 1, 0.35, 0.85],
  soil: [1, 0.62, 0.2, 0.85],
  halo: [0.75, 0.45, 1, 0.8],
  buried: [1, 0.9, 0.25, 0.95],
  post: [1, 0.35, 0.85, 0.9],
};

/** view units from the top of the stage to the bottom, whatever its size */
export const VIEW_H = 720;
/** where the forest floor sits when the camera is at rest: this share of the view from the top */
const FLOOR_AT = 0.38;
/**
 * One strip width covers this much of the curve: 0.243 units per texel, so the strip's 589 rows are about 38 cm
 * (3.75 units per cm). Measured off the picture: its clover leaves (2–3 cm, 35–49 px) and oak and beech leaves
 * (7–12 and 5–10 cm, 120 and 78 px) give about 0.65 mm per pixel. The soils take the same scale.
 */
const STRIP_TILE = 335;
/** columns of the ground mesh, this far apart */
const COL = 8;
/** the mesh reaches this far past the world's sides: the strip's bottom leans with the slope, so where the columns end
 * the soil below them would stop short of the view's edge */
const MARGIN = 320;
/** the strip's top edge sits this share of its height above the curve: its clear rows above the moss */
const LIFT = 0.1;
/** where the moss ends in the strip picture (v, measured off assets/tex-ground.webp: below it, no green) */
const MOSS = 0.57;
/** where the moss ends in the hill's strip picture (assets/tex-ground-c.webp: green down to about here, then stones) */
const RIDGE_MOSS = 0.38;
/** how far below the floor's top the hill's moss body reaches: behind the floor's opaque moss, where it is hidden */
const RIDGE_BURY = 30;
/** the hill is a little darker: further back, more shaded */
const RIDGE_SHADE = 0.82;
/** the hill's strip cells are seeded apart from the floor's, so their seams don't line up */
const RIDGE_SEED = 17;
/** floats per ground vertex: position, uv, depth, where the moss ends in its column */
const STRIDE = 6;
/** the strip gives way to the soil from v FADE[0] to FADE[1], the line rising and dipping by up to FADE[2] / 2 */
const FADE: RGB = [0.6, 0.98, 0.5];
/** seconds a ground needs to settle into an edited one */
const MORPH = 0.6;
/** a desktop starts at the top of the pixel ladder (src/ui/budget.ts), a touch screen this many steps down */
const TOUCH = 3;
/** how far out and in the camera zooms (1: VIEW_H tall) */
const ZOOM = [0.5, 4] as const;
/** a buried thing's quad reaches this many texels past its picture: room for its blurred shadow (the atlases leave
 * 16 texels between pictures, and the shadow's mip level reads about 4 further, so no neighbour bleeds in) */
const PAD = 6;
/** floats per buried vertex: position, uv, depth, the picture's rect in its atlas, the halo's reach, gem or not */
const BURIED_STRIDE = 11;
/** how much soil stains a gem's picture (other things: fully), and how bright it is (other things: BURIED_DIM): its
 * colour is the find, so it stands out of the soil a little, deep down too */
const GEM_STAIN = 0.25;
const GEM_LIGHT = 0.9;
/** how dark a buried thing's shadow is, and how far below it it falls (view units: light comes from above) */
const SHADOW = 0.55;
const SHADOW_DROP = 3;
/** the darkened soil around a treasure follows its outline: its silhouette spread by this share of its narrow side
 * plus this many view units (so a ring gets one too), this dark where it is thickest; it fades out toward the
 * floor, never over the moss */
const HALO_REACH = 0.3;
const HALO_PAD = 14;
const HALO_DARK = 0.5;
/** buried things lie out of the sun, in the soil's shade */
const BURIED_DIM = 0.8;
/** the passes of buried.frag (scripts/perf names its draws by them) */
export const PASS = { picture: 0, shadow: 1, halo: 2, glint: 3 } as const;

/** a tree's mesh: this many columns; the rows below KNEE (a share of the picture from the top) bend with the floor */
const TREE_COLS = 16;
const KNEE = 0.82;
/** the mesh's rows, down the picture: its top, the knee, its foot */
const TREE_ROWS = [0, KNEE, 1] as const;
/** vertices per tree */
const TREE_VERTS = (TREE_COLS + 1) * TREE_ROWS.length;
/** how far a tree's foot is sunk under the floor's curve: the strip's dense moss starts about 17 units under it (its
 * top rows are clear, then tufts), so this is the foot about 7 cm into the moss */
const SINK = 45;
/** floats per tree vertex: position, uv in the picture */
const TREE_STRIDE = 4;
/** floats per column of the ground lookup (shaders/groundat.glsl): the curve's y, u, the strip's height, its moss */
const AT_STRIDE = 4;
/** each canopy piece's outline: its underside in this many segments, between two straight sides */
const CROWN_COLS = 40;
/** columns per piece (the sides' tops, the underside's points) and vertices (three per column: the ribbon's inner
 * edge, where it stops being opaque, its outer edge; and the fan's centre) */
const CROWN_COLUMNS = CROWN_COLS + 3;
const CROWN_VERTS = 3 * CROWN_COLUMNS + 1;
/** floats per crown vertex: position, uv, piece */
const CROWN_STRIDE = 5;
/** a piece's sides run up this far past the world's top (or its ellipse's centre, if that is higher) */
const CROWN_ABOVE = 100;
/** the crowns' leaves are drawn this much smaller than the library measured them (its `s`, by leaf length): at that
 * size they looked 20–40 % too large beside the trunks; strip and fill shrink together, so their leaves still match */
const LEAF_SCALE = 0.7;
/** each piece reads the canopy strip this many strip widths on from the one before, so their cells don't line up */
const PIECE_U = 2.37;
/** how far a piece's underside wobbles in and out, a share of its size */
const WOBBLE = 0.07;
/** how light each layer of a crown's pieces is, back to front (crown.ts, LAYERS): further in, more shaded */
const LAYER_SHADE = [0.6, 0.72, 0.86, 1];
/** how far a tree furthest back (Tree.depth 1) has faded into the air */
const HAZE = 0.3;
/** the crown's strip cells are seeded apart from the ground's and the hill's */
const CROWN_SEED = 29;
/** how dark the crown's shade gets right under a piece: on its crown's other pieces and the trunks, and on the hill
 * and floor (further down it is lighter anyway; the floor is lit from the sides too) */
const CROWN_SHADOW = 0.6;
const FLOOR_SHADOW = 0.4;
/** the canopy's shade map (shaders/shademap.glsl, baked by bakeShade): view units per texel over the whole world (the
 * shade is soft: its narrowest edges are 60 units), and its layers: the floor's, one per tree's trunk, one per piece;
 * tiles of one texture, SHADE_COLS across, so a bake is one render pass */
const SHADE_TEXEL = 16;
const SHADE_W = Math.ceil((WORLD.x1 - WORLD.x0) / SHADE_TEXEL);
const SHADE_H = Math.ceil((WORLD.top - WORLD.bottom) / SHADE_TEXEL);
const SHADE_TRUNK = 1;
const SHADE_PIECE = SHADE_TRUNK + TREES_MAX;
const SHADE_COLS = 9;
const SHADE_ROWS = Math.ceil((SHADE_PIECE + CROWN_PIECES) / SHADE_COLS);
/** the shade map's tiles: the world a tile covers (x0, y0, 1 / width, 1 / height); tiles across and down, half a texel
 * of a tile across and down (shaders/shademap.glsl) */
const SHADE_RECT = [WORLD.x0, WORLD.bottom, 1 / (SHADE_W * SHADE_TEXEL), 1 / (SHADE_H * SHADE_TEXEL)];
const SHADE_GRID = [SHADE_COLS, SHADE_ROWS, 0.5 / SHADE_W, 0.5 / SHADE_H];

/** The air. Neutral daylight for now; the assets carry no mood of their own, so this is where it will change. */
const AIR = {
  skyHigh: [0.33, 0.37, 0.3] as RGB,
  skyLow: [0.7, 0.71, 0.6] as RGB,
  light: [1, 0.93, 0.78] as RGB,
  tint: [1, 0.98, 0.94] as RGB,
  deep: [0.035, 0.03, 0.025] as RGB,
};

/** the normal into the ground under curve `f` at x, blended with straight down so steep bits don't fold over */
function inward(f: (x: number) => number, x: number): [number, number] {
  const ty = f(x + COL) - f(x - COL);
  const tl = Math.hypot(2 * COL, ty);
  const nx = (ty / tl) * 0.6;
  const ny = ((-2 * COL) / tl) * 0.6 - 0.4;
  const nl = Math.hypot(nx, ny);
  return [nx / nl, ny / nl];
}

/**
 * The colour of a band of rows (0 … 1 from the top) between its bright bits: a geometric mean, so a few light pebbles
 * or leaves don't pull it up. Straight colour, 0 … 1.
 */
function soilColor(b: ImageBitmap, y0: number, y1: number): RGB {
  const N = 64;
  const c = new OffscreenCanvas(N, N);
  const g = c.getContext('2d')!;
  g.drawImage(b, 0, b.height * y0, b.width, b.height * (y1 - y0), 0, 0, N, N);
  const px = g.getImageData(0, 0, N, N).data;
  const sum: RGB = [0, 0, 0];
  for (let i = 0; i < px.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += Math.log((px[i + k]! + 1) / 256);
  return sum.map((v) => Math.exp(v / (N * N))) as RGB;
}

/** where a hanging strip stops being solid: the first row (0 … 1 from the top) less than 97 % opaque */
function solidRows(b: ImageBitmap): number {
  const W = 64;
  const H = Math.min(256, b.height);
  const c = new OffscreenCanvas(W, H);
  const g = c.getContext('2d')!;
  g.drawImage(b, 0, 0, W, H);
  const px = g.getImageData(0, 0, W, H).data;
  for (let y = 0; y < H; y++) {
    let a = 0;
    for (let x = 0; x < W; x++) a += px[(y * W + x) * 4 + 3]!;
    if (a / (W * 255) < 0.97) return y / H;
  }
  return 1;
}

/** each layer's place in painter's order, its depth (the later, the nearer): the forest's draws take one each from
 * `forest` on, what lies buried the last */
const SLOT = { sky: 0, ridge: 1, ground: 2, forest: 3 } as const;

/** one of the forest's draws: a tree's trunk (piece -1; under its crown's pieces from `first` on) or a canopy piece;
 * its tree's pieces are start … end - 1 */
interface Step {
  tree: number;
  piece: number;
  first: number;
  start: number;
  end: number;
  slot: number;
}

/** the forest in painter's order, tree by tree from the back: the pieces behind its trunk, the trunk, then the rest
 * (crown.ts sorts them so; every crown has a piece in front, so every trunk is drawn) */
function forestOrder(pieces: readonly { tree: number; behind: boolean }[]): Step[] {
  const steps: Step[] = [];
  let start = 0;
  let end = 0;
  pieces.forEach(({ tree, behind }, p) => {
    const first = p === 0 || pieces[p - 1]!.tree !== tree;
    if (first) {
      start = end = p;
      while (pieces[end]?.tree === tree) end++;
    }
    const step = { tree, piece: p, first: p, start, end, slot: 0 };
    if (!behind && (first || pieces[p - 1]!.behind)) steps.push({ ...step, piece: -1 });
    steps.push(step);
  });
  steps.forEach((s, i) => (s.slot = SLOT.forest + i));
  return steps;
}

/** the shade map's texels (a scissor: x, y, width, height) over the vertices `count` from `at`, `stride` floats apart
 * in v (position first), a texel more around for the filtering */
function shadeBox(v: Float32Array, at: number, count: number, stride: number): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let k = at * stride; k < (at + count) * stride; k += stride) {
    x0 = Math.min(x0, v[k]!);
    x1 = Math.max(x1, v[k]!);
    y0 = Math.min(y0, v[k + 1]!);
    y1 = Math.max(y1, v[k + 1]!);
  }
  const c0 = Math.max(0, Math.floor((x0 - WORLD.x0) / SHADE_TEXEL) - 1);
  const r0 = Math.max(0, Math.floor((y0 - WORLD.bottom) / SHADE_TEXEL) - 1);
  const c1 = Math.min(SHADE_W, Math.ceil((x1 - WORLD.x0) / SHADE_TEXEL) + 1);
  const r1 = Math.min(SHADE_H, Math.ceil((y1 - WORLD.bottom) / SHADE_TEXEL) + 1);
  return [c0, r0, Math.max(0, c1 - c0), Math.max(0, r1 - r0)];
}

export class ForestRenderer {
  /** false: no WebGL2 */
  readonly ok: boolean;
  gentle = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** where the camera looks, in view units; clamped to the world each frame */
  cam = { x: 0, y: 0 };
  /** 1: VIEW_H units tall; pinch or ctrl + wheel changes it */
  zoom = 1;
  /** debug: draw every draw's edges over the picture (dev builds' wireframe button) */
  wire = false;

  private cv: HTMLCanvasElement;
  private gl: GL | null;
  private lost = false;
  private assets: Assets | null = null;
  private W = 1;
  private H = 1;
  private time = 0;
  private budget: PixelBudget;
  private scene: Target | null = null;

  /** every program (shaders/index.ts) */
  private p: Programs | null = null;
  /** what the frame's programs share, each taking what it declares (frame() refreshes it) */
  private common = {
    uCam: new Float32Array(4),
    uTint: AIR.tint,
    uSkyHigh: AIR.skyHigh,
    uSkyLow: AIR.skyLow,
    uDeep: AIR.deep,
    uDrift: [0, 0] as number[],
    uShadeMap: null as WebGLTexture | null,
    uShadeRect: SHADE_RECT,
    uShadeGrid: SHADE_GRID,
  };
  private empty: WebGLVertexArrayObject | null = null;
  private mesh: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private count = 0;
  private ridgeVao: WebGLVertexArrayObject | null = null;
  private ridgeVbo: WebGLBuffer | null = null;
  private ridgeCount = 0;
  private wireRidgeVao: WebGLVertexArrayObject | null = null;
  /** line indices: the band rows' edges first, then the body rows' */
  private wireBand = 0;
  private wireBody = 0;
  private wireVao: WebGLVertexArrayObject | null = null;
  /** line indices: the strip rows' edges first, then the soil rows' */
  private wireStrip = 0;
  private wireSoil = 0;
  private strip: WebGLTexture | null = null;
  private soils: WebGLTexture | null = null;
  private stripW = 1;
  private stripH = 1;
  private soilTile = 1;
  private soilGain: RGB = [1, 1, 1];
  private ridgeTex: WebGLTexture | null = null;
  /** the hill strip's height in view units, as photographed */
  private ridgeH = 1;
  private mossFill: WebGLTexture | null = null;
  private mossTile = 1;
  private mossGain: RGB = [1, 1, 1];
  /** the atlases of what lies buried, in ATLASES order */
  private atlasTex: WebGLTexture[] = [];
  private buriedVao: WebGLVertexArrayObject | null = null;
  private buriedVbo: WebGLBuffer | null = null;
  private wireBuriedVao: WebGLVertexArrayObject | null = null;
  /** quads per atlas (ATLASES order), one after the other in the buffer */
  private buriedCount: number[] = ATLASES.map(() => 0);
  /** treasures' halos per atlas: quads after every thing's own, grouped the same way */
  private haloCount: number[] = ATLASES.map(() => 0);
  /** the soil's colour (straight), what buried things are stained toward */
  private earth: RGB = [0.3, 0.22, 0.15];
  /** the trees: the trunks the forest stands (and the one easing in) and their pictures and reliefs as textures (by
   * TRUNKS index; dropTrunks frees the others), their meshes one after the other (TREE_COLS + 1 columns of TREE_ROWS
   * each), indices per tree (triangles, and edges for the wireframe) */
  private trunks = new Map<number, Trunk>();
  private trunkTex = new Map<number, { picture: WebGLTexture; relief: WebGLTexture }>();
  private treeVao: WebGLVertexArrayObject | null = null;
  private treeVbo: WebGLBuffer | null = null;
  private treeIdx = 0;
  /** how many trees the forest has */
  private treeCount = 0;
  private wireTreeVao: WebGLVertexArrayObject | null = null;
  private wireTreeIdx = 0;
  private treeVerts = new Float32Array(TREES_MAX * TREE_VERTS * TREE_STRIDE);
  /** the moss carpets' colour matched to the floor strip's moss: what climbs the tree's foot */
  private floorMossGain: RGB = [1, 1, 1];
  /** the ground mesh's columns for shaders that need the floor at a point (shaders/groundat.glsl) */
  private groundAtTex: WebGLTexture | null = null;
  private groundAt: Float32Array;
  /** the canopy's shade, baked per forest (bakeShade): its layers, the framebuffer they are drawn into */
  private shadeTex: WebGLTexture | null = null;
  private shadeFbo: WebGLFramebuffer | null = null;
  /** the canopy, per kind of leaves (trees.ts: LEAVES): its canopy strip and leaf fill, where the strip stops being
   * solid, the fill's colour matched to the strip's dense top and that top's brightness (what the season's colours
   * map from) */
  private canopyTex: WebGLTexture[] = [];
  private leafTex: WebGLTexture[] = [];
  private canopySolid = CANOPIES.map(() => 0.3);
  private leafGain: RGB[] = CANOPIES.map(() => [1, 1, 1]);
  private leafLuma = CANOPIES.map(() => 0.3);
  private crownVao: WebGLVertexArrayObject | null = null;
  private crownVbo: WebGLBuffer | null = null;
  /** indices per piece (triangles, and edges for the wireframe), and how many pieces the canopy has; a piece's body
   * (its fan and the opaque inner band of its ribbon) comes first, crownBody indices, then its fringe */
  private crownIdx = 0;
  private crownBody = 0;
  private wireCrownVao: WebGLVertexArrayObject | null = null;
  private wireCrownIdx = 0;
  private pieceCount = 0;
  private crownVerts = new Float32Array(CROWN_PIECES * CROWN_VERTS * CROWN_STRIDE);
  /** per piece in world units: its centre, its width left and right; its underside's height and roundness
   * (shaders/crown.glsl); how light it is by its layer */
  private pieces = new Float32Array(CROWN_PIECES * 4);
  private pieceShape = new Float32Array(CROWN_PIECES * 2);
  private pieceShade = new Float32Array(CROWN_PIECES);
  /** the forest's draws in painter's order (forestOrder), and how many depth slots the frame has: sky, hill, floor,
   * these, what lies buried */
  private order: Step[] = [];
  private slots = 1;

  /** the ground drawn now, the one it eases toward, and how long that still takes */
  private shown: Ground | null = null;
  private goal: Ground | null = null;
  private morph = 0;
  private verts: Float32Array;
  /** the hill: per column its top, the bottom of its moss band, the bottom of its body; position, uv */
  private ridgeVerts: Float32Array;
  /** what lies buried: four corners per thing, grouped by atlas; position, uv, depth */
  private buriedVerts = new Float32Array((BURIED_MAX + TREASURE_MAX) * 4 * BURIED_STRIDE);
  private cols: number;

  constructor(cv: HTMLCanvasElement) {
    this.cv = cv;
    this.gl = cv.getContext('webgl2', { alpha: false, antialias: false, depth: false, premultipliedAlpha: true });
    this.ok = !!this.gl;
    this.budget = new PixelBudget(undefined, typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches ? 0 : TOUCH);
    this.cols = Math.floor((WORLD.x1 - WORLD.x0 + 2 * MARGIN) / COL) + 1;
    this.verts = new Float32Array(this.cols * 3 * STRIDE);
    this.ridgeVerts = new Float32Array(this.cols * 3 * 4);
    this.groundAt = new Float32Array(this.cols * AT_STRIDE);
    cv.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
      this.scene = null;
    });
    cv.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this.setup();
      if (this.assets) this.upload(this.assets);
      const trunks = this.trunks;
      this.trunks = new Map();
      this.trunkTex.clear();
      this.addTrunks(trunks);
      if (this.shown) this.build(this.shown);
    });
    this.setup();
  }

  /** programs and buffers; again after a lost context */
  private setup(): void {
    const gl = this.gl;
    if (!gl) return;
    // a saved shader file (dev) relinks them in place; the baked shade comes from one of them
    this.p = programs(gl, () => this.bakeShade());
    this.empty = gl.createVertexArray();
    // the ground: pos xy, uv, depth, where the moss ends; two quads per column pair: strip (rows 0–1) and soil below
    // it (rows 1–2). Its wireframe: row 1's horizontals count as strip
    this.vbo = vertexBuffer(gl, this.verts.byteLength);
    const idx = new Uint16Array((this.cols - 1) * 12);
    const strip: number[] = [];
    const soil: number[] = [];
    for (let i = 0; i < this.cols; i++) {
      const a = i * 3;
      const b = a + 3;
      strip.push(a, a + 1);
      soil.push(a + 1, a + 2);
      if (i + 1 < this.cols) {
        for (const r of [0, 1]) idx.set([a + r, a + r + 1, b + r, b + r, a + r + 1, b + r + 1], i * 12 + r * 6);
        strip.push(a, b, a + 1, b + 1, a + 1, b);
        soil.push(a + 2, b + 2, a + 2, b + 1);
      }
    }
    this.count = idx.length;
    this.mesh = vao(gl, this.vbo, [2, 2, 1, 1], idx);
    this.wireStrip = strip.length;
    this.wireSoil = soil.length;
    this.wireVao = vao(gl, this.vbo, [2, 2, 1, 1], new Uint16Array([...strip, ...soil]));
    // the hill: pos xy, uv; three rows per column (band, body), two quads per column pair
    this.ridgeVbo = vertexBuffer(gl, this.ridgeVerts.byteLength);
    const ridx = new Uint16Array((this.cols - 1) * 12);
    const band: number[] = [];
    const body: number[] = [];
    for (let i = 0; i < this.cols; i++) {
      const a = i * 3;
      const b = a + 3;
      band.push(a, a + 1);
      body.push(a + 1, a + 2);
      if (i + 1 < this.cols) {
        for (const r of [0, 1]) ridx.set([a + r, a + r + 1, b + r, b + r, a + r + 1, b + r + 1], i * 12 + r * 6);
        band.push(a, b, a + 1, b + 1, a + 1, b);
        body.push(a + 2, b + 2, a + 2, b + 1);
      }
    }
    this.ridgeCount = ridx.length;
    this.ridgeVao = vao(gl, this.ridgeVbo, [2, 2], ridx);
    this.wireBand = band.length;
    this.wireBody = body.length;
    this.wireRidgeVao = vao(gl, this.ridgeVbo, [2, 2], new Uint16Array([...band, ...body]));
    // what lies buried: a quad per thing (two triangles), then one per treasure's halo; pos xy, uv, depth, the
    // picture's rect in its atlas, how far the halo reaches (texels), 1 for a gem (less stained; glints). Corners:
    // top left, top right, bottom left, bottom right
    this.buriedVbo = vertexBuffer(gl, this.buriedVerts.byteLength);
    const quads = BURIED_MAX + TREASURE_MAX;
    const bidx = new Uint16Array(quads * 6);
    const blines = new Uint16Array(quads * 10);
    for (let i = 0; i < quads; i++) {
      const a = i * 4;
      bidx.set([a, a + 2, a + 1, a + 1, a + 2, a + 3], i * 6);
      blines.set([a, a + 1, a + 1, a + 3, a + 3, a + 2, a + 2, a, a + 1, a + 2], i * 10);
    }
    this.buriedVao = vao(gl, this.buriedVbo, [2, 2, 1, 4, 1, 1], bidx);
    this.wireBuriedVao = vao(gl, this.buriedVbo, [2, 2, 1, 4, 1, 1], blines);
    // the trees: pos xy, uv in the picture; per tree TREE_ROWS per column, a quad per cell; tree t's vertices and
    // indices follow tree t - 1's
    this.treeVbo = vertexBuffer(gl, this.treeVerts.byteLength);
    const tidx: number[] = [];
    const tlines: number[] = [];
    const R = TREE_ROWS.length;
    for (let t = 0; t < TREES_MAX; t++) {
      for (let i = 0; i <= TREE_COLS; i++) {
        const a = t * TREE_VERTS + i * R;
        const b = a + R;
        for (let r = 0; r + 1 < R; r++) {
          tlines.push(a + r, a + r + 1);
          if (i < TREE_COLS) {
            tidx.push(a + r, a + r + 1, b + r, b + r, a + r + 1, b + r + 1);
            tlines.push(a + r, b + r, a + r + 1, b + r);
          }
        }
        if (i < TREE_COLS) tlines.push(a + R - 1, b + R - 1);
      }
    }
    this.treeIdx = tidx.length / TREES_MAX;
    this.treeVao = vao(gl, this.treeVbo, [2, 2], new Uint16Array(tidx));
    this.wireTreeIdx = tlines.length / TREES_MAX;
    this.wireTreeVao = vao(gl, this.treeVbo, [2, 2], new Uint16Array(tlines));
    // the canopy: pos xy, uv, piece; per piece a ribbon (an inner, an opaque edge's and an outer vertex per column)
    // and a fan from high above to the ribbon's inner edge. The topology is fixed, build() moves the vertices; piece
    // p's indices follow piece p - 1's, its body's (fan and inner band) before its fringe's (outer band)
    this.crownVbo = vertexBuffer(gl, this.crownVerts.byteLength);
    const cidx: number[] = [];
    const clines: number[] = [];
    for (let p = 0; p < CROWN_PIECES; p++) {
      const centre = (p + 1) * CROWN_VERTS - 1;
      const body: number[] = [];
      const fringe: number[] = [];
      for (let i = 0; i < CROWN_COLUMNS; i++) {
        const a = p * CROWN_VERTS + 3 * i; // inner; a + 1 opaque edge, a + 2 outer
        const b = a + 3;
        clines.push(a, a + 2, centre, a);
        if (i + 1 < CROWN_COLUMNS) {
          body.push(centre, a, b, a, a + 1, b, b, a + 1, b + 1);
          fringe.push(a + 1, a + 2, b + 1, b + 1, a + 2, b + 2);
          clines.push(a, b, a + 1, b + 1, a + 2, b + 2, a + 1, b, a + 2, b + 1);
        }
      }
      this.crownBody = body.length;
      cidx.push(...body, ...fringe);
    }
    this.crownIdx = cidx.length / CROWN_PIECES;
    this.crownVao = vao(gl, this.crownVbo, [2, 2, 1], new Uint16Array(cidx));
    this.wireCrownIdx = clines.length / CROWN_PIECES;
    this.wireCrownVao = vao(gl, this.crownVbo, [2, 2, 1], new Uint16Array(clines));
    // the floor at a point: a float texel per ground column, read exactly (texelFetch), filled by build()
    this.groundAtTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.groundAtTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, this.cols, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    // the shade map: two channels per layer (shade, occlusion), filled by bakeShade()
    this.shadeTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.shadeTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RG8, SHADE_W * SHADE_COLS, SHADE_H * SHADE_ROWS);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.shadeFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadeFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.shadeTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** the pictures as textures; the soils' scale and colour follow the strip they meet */
  upload(a: Assets): void {
    this.assets = a;
    const gl = this.gl;
    if (!gl || this.lost) return;
    // the strip isn't seamless: shaders/strip.glsl cuts it into cells that never read past its edges
    this.strip = texture(gl, a.ground, 'clamp', 'clamp');
    this.stripW = STRIP_TILE;
    this.stripH = (STRIP_TILE * a.ground.height) / a.ground.width;
    // layer i is soil-i; the shader picks horizons by index
    const soils = [a['soil-0'], a['soil-1'], a['soil-2'], a['soil-3']];
    this.soils = textureArray(gl, soils);
    this.soilTile = (soils[0]!.width * STRIP_TILE) / a.ground.width;
    // where the strip meets the soil it meets leafy humus (soil-3): match its colour there, the horizons keep their differences
    const s = soilColor(a.ground, FADE[0], 1);
    const l = soilColor(a['soil-3'], 0, 1);
    this.soilGain = s.map((v, k) => Math.max(0.6, Math.min(1.6, v / Math.max(0.01, l[k]!)))) as RGB;
    this.earth = s;
    // the hill behind: another strip at the same texel scale, its moss band over a hex-tiled moss carpet, whose
    // colour is matched to the band's moss (rows 15–34 % of the picture: under the tufts, above the stones)
    this.ridgeTex = texture(gl, a['ground-c'], 'clamp', 'clamp');
    this.ridgeH = (STRIP_TILE * a['ground-c'].height) / a['ground-c'].width;
    const mosses = [a['moss-0'], a['moss-1'], a['moss-2'], a['moss-3']];
    this.mossFill = textureArray(gl, mosses);
    this.mossTile = (mosses[0]!.width * STRIP_TILE) / a.ground.width;
    const band = soilColor(a['ground-c'], 0.15, 0.34);
    const carpets = mosses.map((m) => soilColor(m, 0, 1));
    this.mossGain = band.map((v, k) => {
      const mean = carpets.reduce((s, c) => s + c[k]!, 0) / carpets.length;
      return Math.max(0.5, Math.min(1.5, v / Math.max(0.01, mean)));
    }) as RGB;
    // the moss climbing the tree's foot matches the floor strip's moss (rows 15–50 %: under the tufts, above the soil)
    const floorMoss = soilColor(a.ground, 0.15, 0.5);
    this.floorMossGain = floorMoss.map((v, k) => {
      const mean = carpets.reduce((s, c) => s + c[k]!, 0) / carpets.length;
      return Math.max(0.5, Math.min(1.5, v / Math.max(0.01, mean)));
    }) as RGB;
    // what lies buried: sprites packed 16 texels apart, the quads padded into that gap
    this.atlasTex = ATLASES.map((k) => texture(gl, a[k], 'clamp', 'clamp'));
    // the crowns' leaves, per kind: the canopy strip (cut into cells like the ground strip, so clamped) and its leaf
    // fill (hex-tiled, so repeating); the fill's colour matched to the strip's dense top, whose brightness the
    // season's colours map from
    this.canopyTex = CANOPIES.map((k) => texture(gl, a[k], 'clamp', 'clamp'));
    this.leafTex = LEAF_FILLS.map((k) => texture(gl, a[k], 'repeat', 'repeat'));
    CANOPIES.forEach((k, i) => {
      const solid = solidRows(a[k]);
      const top = soilColor(a[k], 0, 0.8 * solid);
      const fill = soilColor(a[LEAF_FILLS[i]!], 0, 1);
      this.canopySolid[i] = solid;
      this.leafGain[i] = top.map((v, c) => Math.max(0.6, Math.min(1.6, v / Math.max(0.01, fill[c]!)))) as RGB;
      this.leafLuma[i] = 0.299 * top[0] + 0.587 * top[1] + 0.114 * top[2];
    });
  }

  /** trunks as they arrive (assets.ts: fetchTrunks), as textures: their pictures and reliefs (data: mipmapped like a
   * picture, the normals average out with distance). A ground may only be set once its trunks are here */
  addTrunks(trunks: Map<number, Trunk>): void {
    const gl = this.gl;
    for (const [i, t] of trunks) {
      if (this.trunks.has(i)) continue;
      this.trunks.set(i, t);
      if (!gl || this.lost) continue;
      this.trunkTex.set(i, { picture: texture(gl, t.picture, 'clamp', 'clamp'), relief: texture(gl, t.relief, 'clamp', 'clamp') });
    }
  }

  /** a new ground (its trunks added already): eases in from the one shown, or snaps (`now`, or nothing shown yet) */
  setGround(g: Ground, now = false): void {
    this.goal = g;
    if (now || !this.shown || this.gentle) {
      this.shown = g;
      this.morph = 0;
      this.build(g);
      this.dropTrunks(g);
    } else this.morph = MORPH;
  }

  /**
   * Frees the textures of the trunks `g` doesn't stand, once it is all that is shown: a trunk is 10 MB or more on the
   * GPU, and each new text stands others. One that comes back is uploaded again from assets.ts' cache (a few ms).
   */
  private dropTrunks(g: Ground): void {
    const keep = new Set(g.trees.map((t) => t.trunk));
    for (const [i, tex] of this.trunkTex) {
      if (keep.has(i)) continue;
      this.gl?.deleteTexture(tex.picture);
      this.gl?.deleteTexture(tex.relief);
      this.trunkTex.delete(i);
      this.trunks.delete(i);
    }
  }

  /** the camera at rest: the floor under x at FLOOR_AT of the view */
  home(x = 0): void {
    this.cam.x = x;
    this.cam.y = (this.shown ? heightAt(this.shown, x) : 0) + this.viewH * (FLOOR_AT - 0.5);
    this.clamp();
  }

  /** view units from the top of the stage to the bottom at the current zoom */
  get viewH(): number {
    return VIEW_H / this.zoom;
  }

  /** moves the camera by a drag of dx, dy CSS pixels (the world follows the finger) */
  pan(dx: number, dy: number): void {
    const k = this.viewH / this.H;
    this.cam.x -= dx * k;
    this.cam.y += dy * k;
    this.clamp();
  }

  /** zooms by `f` (> 1: closer) around the stage point x, y (CSS pixels): what is under it stays there */
  zoomAt(f: number, x: number, y: number): void {
    const k = this.viewH / this.H;
    const wx = this.cam.x + (x - this.W / 2) * k;
    const wy = this.cam.y - (y - this.H / 2) * k;
    this.zoom = Math.max(ZOOM[0], Math.min(ZOOM[1], this.zoom * f));
    const k2 = this.viewH / this.H;
    this.cam.x = wx - (x - this.W / 2) * k2;
    this.cam.y = wy + (y - this.H / 2) * k2;
    this.clamp();
  }

  private clamp(): void {
    const hh = this.viewH / 2;
    const hw = (hh * this.W) / this.H;
    const c = this.cam;
    c.x = WORLD.x1 - WORLD.x0 <= 2 * hw ? (WORLD.x0 + WORLD.x1) / 2 : Math.max(WORLD.x0 + hw, Math.min(WORLD.x1 - hw, c.x));
    c.y = WORLD.top - WORLD.bottom <= 2 * hh ? (WORLD.top + WORLD.bottom) / 2 : Math.max(WORLD.bottom + hh, Math.min(WORLD.top - hh, c.y));
  }

  resize(cssW: number, cssH: number): void {
    this.W = Math.max(1, cssW);
    this.H = Math.max(1, cssH);
    const dpr = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2);
    const w = Math.max(1, Math.round(this.W * dpr));
    const h = Math.max(1, Math.round(this.H * dpr));
    if (this.cv.width !== w || this.cv.height !== h) {
      this.cv.width = w;
      this.cv.height = h;
    }
    this.clamp();
  }

  /**
   * The ribbon along the curve: per column the top of the strip, its bottom along the normal, the world's bottom.
   * The moss is stretched or squeezed by mossAt (its soil keeps its size, so the strip grows and shrinks with it);
   * each vertex carries where in its column the moss ends, the shader maps that back onto the picture.
   */
  private build(g: Ground): void {
    const gl = this.gl;
    const v = this.verts;
    const H = this.stripH;
    const lift = LIFT * H;
    let arc = 0;
    let u0 = 0;
    let px = 0;
    let py = 0;
    for (let i = 0; i < this.cols; i++) {
      const x = WORLD.x0 - MARGIN + i * COL;
      const y = heightAt(g, x) + lift;
      if (i > 0) arc += Math.hypot(x - px, y - py);
      // u counts from x = 0, so an edited ground slides the texture least where the camera starts
      if (x <= 0) u0 = arc;
      px = x;
      py = y;
      const [nx, ny] = inward((x) => heightAt(g, x), x);
      const s = mossAt(g, x);
      const Hc = H * (MOSS * s + 1 - MOSS);
      const m = (MOSS * s) / (MOSS * s + 1 - MOSS);
      const bx = x + nx * Hc;
      const by = y + ny * Hc;
      const o = i * 3 * STRIDE;
      v.set([x, y, arc, 0, -lift, m], o);
      v.set([bx, by, arc, 1, heightAt(g, bx) - by, m], o + STRIDE);
      v.set([bx, WORLD.bottom, arc, 1 + (by - WORLD.bottom) / Hc, heightAt(g, bx) - WORLD.bottom, m], o + 2 * STRIDE);
      this.groundAt.set([y - lift, arc, Hc, m], i * AT_STRIDE);
    }
    // arc length → strip repeats, from x = 0
    for (let i = 0; i < this.cols * 3; i++) v[i * STRIDE + 2] = (v[i * STRIDE + 2]! - u0) / this.stripW;
    for (let i = 0; i < this.cols; i++) this.groundAt[i * AT_STRIDE + 1] = (this.groundAt[i * AT_STRIDE + 1]! - u0) / this.stripW;
    this.buildRidge(g);
    this.buildBuried(g);
    this.buildTrees(g);
    this.buildCrown(g);
    this.bakeShade();
    if (!gl || this.lost || !this.vbo) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, v);
    gl.bindTexture(gl.TEXTURE_2D, this.groundAtTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.cols, 1, gl.RGBA, gl.FLOAT, this.groundAt);
  }

  /** tree t's foot (the manifest's anchor, SINK under the floor at its x) and the top of its trunk, leaning with it,
   * and its view units per tree unit */
  private treeAt(g: Ground, t: Tree): { foot: number; top: [number, number]; k: number } {
    const f = trunkFrame(t);
    const k = TREE_SCALE * t.scale;
    const foot = heightAt(g, t.x) - SINK;
    const h = f.ay * f.s * k * t.stretch;
    return { foot, top: [t.x + h * Math.sin(t.tilt), foot + h * Math.cos(t.tilt)], k };
  }

  /**
   * The trees' meshes, one after the other: each its picture at its size, mirrored or not, its foot standing in the
   * floor (treeAt). Above KNEE it leans by its tilt (a shear: the foot stays on the floor); below, each column bends
   * toward the floor under it, so the foot follows a slope instead of floating over one side of it.
   */
  private buildTrees(g: Ground): void {
    const gl = this.gl;
    const v = this.treeVerts;
    this.treeCount = g.trees.length;
    g.trees.forEach((t, n) => {
      const f = trunkFrame(t);
      const page = TREE_PAGES[t.trunk]!;
      const { foot: base, k } = this.treeAt(g, t);
      const w = f.w * f.s * k;
      const h = f.h * f.s * k * t.stretch;
      const foot = f.ay / f.h;
      // the anchor's share of the width, from the left as drawn
      const ax = t.flip ? 1 - f.ax / f.w : f.ax / f.w;
      const lean = Math.sin(t.tilt);
      const up = Math.cos(t.tilt);
      for (let i = 0; i <= TREE_COLS; i++) {
        const s = i / TREE_COLS;
        const u = t.flip ? 1 - s : s;
        const x = t.x + (s - ax) * w;
        const bend = heightAt(g, x) - heightAt(g, t.x);
        TREE_ROWS.forEach((r, j) => {
          const above = (foot - r) * h;
          const y = base + above * up + bend * Math.min(1, Math.max(0, (r - KNEE) / (foot - KNEE)));
          // u, v in its page (the picture sits GAP texels in, the relief page has the same layout)
          v.set(
            [x + above * lean, y, (f.x + u * f.w) / page.w, (f.y + r * f.h) / page.h],
            (n * TREE_VERTS + i * TREE_ROWS.length + j) * TREE_STRIDE,
          );
        });
      }
    });
    if (!gl || this.lost || !this.treeVbo) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.treeVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, v, 0, g.trees.length * TREE_VERTS * TREE_STRIDE);
  }

  /**
   * The canopy's pieces, each over the top of its tree's trunk (crown.ts gives them relative to it). Per piece its
   * outline, a U: the straight sides from high above down to its centre's height, the underside between, a
   * superellipse wider on one side, wobbling a little. The canopy strip runs along it, its dense band inside the
   * outline and its leaves hanging out of it along the outline's normal, u counting from the lowest point; a row of
   * vertices where crown.frag turns translucent cuts it into the body and the fringe. The fan's centre sits high
   * above, on the U's open top.
   */
  private buildCrown(g: Ground): void {
    const gl = this.gl;
    const tops = g.trees.map((t) => this.treeAt(g, t));
    const v = this.crownVerts;
    // per column of the outline: x, y, the outward normal, arc length from the first
    const e: number[][] = [];
    this.pieceCount = g.crown.pieces.length;
    g.crown.pieces.forEach(({ tree, layer, dx, bottom: b, left: l, right: r, ry: h, round, wobble }, p) => {
      // crown.ts gives the pieces relative to their trunk's top, scaled by TREE_SCALE only: a smaller tree further
      // back keeps a crown as wide as any, or the crowns shrank to lollipops; the strip is its tree's kind of leaves
      const { top } = tops[tree]!;
      const kind = g.trees[tree]!.leaves;
      const sw = CANOPY[kind]!.w * CANOPY[kind]!.s * LEAF_SCALE;
      const sh = CANOPY[kind]!.h * CANOPY[kind]!.s * LEAF_SCALE;
      const din = this.canopySolid[kind]! * sh;
      // how far out the ribbon is opaque: CROWN_OPAQUE of its dense band
      const opaque = CROWN_OPAQUE * this.canopySolid[kind]!;
      const [bottom, left, right, ry] = [b, l, r, h].map((n) => n * TREE_SCALE) as [number, number, number, number];
      const cx = top[0] + dx * TREE_SCALE;
      const cy = top[1] + bottom + ry;
      const high = Math.max(WORLD.top, cy) + CROWN_ABOVE;
      this.pieces.set([cx, cy, left, right], p * 4);
      this.pieceShape.set([ry, round], p * 2);
      this.pieceShade[p] = LAYER_SHADE[layer]!;
      e.length = 0;
      e.push([cx - left, high]);
      for (let j = 0; j <= CROWN_COLS; j++) {
        const a = Math.PI * (1 + j / CROWN_COLS);
        const c = Math.cos(a);
        const s = Math.sin(a);
        // the wobble fades out toward the sides, where the outline turns into its straight sides
        const k = 1 + WOBBLE * (0.6 * Math.sin(3 * a + wobble) + 0.4 * Math.sin(5 * a + 2 * wobble)) * s * s;
        const x = Math.sign(c) * Math.abs(c) ** (2 / round) * (c < 0 ? left : right);
        const y = -(Math.abs(s) ** (2 / round)) * ry;
        e.push([cx + x * k, cy + y * k]);
      }
      e.push([cx + right, high]);
      // outward normals from the neighbours (the outline runs down its left side, along its underside, up its right)
      let arc = 0;
      e.forEach((c, i) => {
        const a = e[Math.max(0, i - 1)]!;
        const b = e[Math.min(e.length - 1, i + 1)]!;
        const tl = Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!);
        if (i > 0) arc += Math.hypot(c[0]! - a[0]!, c[1]! - a[1]!);
        c.push((b[1]! - a[1]!) / tl, -(b[0]! - a[0]!) / tl, arc);
      });
      const lowest = e[1 + CROWN_COLS / 2]![4]!;
      let o = p * CROWN_VERTS * CROWN_STRIDE;
      for (const [x, y, nx, ny, s] of e as [number, number, number, number, number][]) {
        const u = (s - lowest) / sw + p * PIECE_U;
        // the strip lies across the outline, its leaves hanging along the normal: blended toward straight down, the
        // ribbon sheared on the steep sides and tilted their leaves
        const mid = opaque * sh - din;
        v.set(
          [
            x - nx * din,
            y - ny * din,
            u,
            0,
            p,
            x + nx * mid,
            y + ny * mid,
            u,
            opaque,
            p,
            x + nx * (sh - din),
            y + ny * (sh - din),
            u,
            1,
            p,
          ],
          o,
        );
        o += 3 * CROWN_STRIDE;
      }
      // the fan's centre: v keeps falling inward (only the fill shows there)
      v.set([cx, high, p * PIECE_U, -(high - (cy - ry) - din) / sh, p], o);
    });
    this.order = forestOrder(g.crown.pieces);
    this.slots = SLOT.forest + this.order.length + 1;
    if (!gl || this.lost || !this.crownVbo) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.crownVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, v, 0, this.pieceCount * CROWN_VERTS * CROWN_STRIDE);
  }

  /**
   * What lies buried: a quad per thing, its depth below the floor right above it (so it rides along while an edited
   * floor eases), turned by its tilt, padded by PAD texels; grouped by atlas, so each atlas is one draw. Then a halo
   * quad per treasure, padded by as far as its halo reaches, grouped the same way.
   */
  private buildBuried(g: Ground): void {
    const gl = this.gl;
    let o = 0;
    ATLASES.forEach((atlas, a) => {
      let n = 0;
      for (const b of g.buried) {
        if (frames[b.frame].atlas !== atlas) continue;
        o = this.buriedQuad(g, b, PAD, 0, o);
        n++;
      }
      this.buriedCount[a] = n;
    });
    ATLASES.forEach((atlas, a) => {
      let n = 0;
      for (const b of g.buried) {
        const f = frames[b.frame];
        if (f.atlas !== atlas || !isTreasure(b.frame)) continue;
        const k = f.s * b.scale;
        const reach = HALO_REACH * Math.min(f.w, f.h) + HALO_PAD / k;
        o = this.buriedQuad(g, b, reach, reach, o);
        n++;
      }
      this.haloCount[a] = n;
    });
    if (!gl || this.lost || !this.buriedVbo) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buriedVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.buriedVerts, 0, o);
  }

  /** one quad over thing b's picture, `pad` texels past it, turned with it, at offset o; `reach` as the halo's.
   * Each corner carries its own depth below the floor. Returns the next offset. */
  private buriedQuad(g: Ground, b: Buried, pad: number, reach: number, o: number): number {
    const v = this.buriedVerts;
    const f = frames[b.frame];
    const A = atlases[f.atlas as AtlasKey];
    const k = f.s * b.scale;
    const hx = (f.w / 2 + pad) * k;
    const hy = (f.h / 2 + pad) * k;
    const cy = heightAt(g, b.x) - b.depth;
    const cos = Math.cos(b.tilt);
    const sin = Math.sin(b.tilt);
    const u0 = (b.flip ? f.x + f.w + pad : f.x - pad) / A.w;
    const u1 = (b.flip ? f.x - pad : f.x + f.w + pad) / A.w;
    const vt = (f.y - pad) / A.h;
    const vb = (f.y + f.h + pad) / A.h;
    for (let c = 0; c < 4; c++) {
      const px = c & 1 ? hx : -hx;
      const py = c < 2 ? hy : -hy;
      const x = b.x + px * cos - py * sin;
      const y = cy + px * sin + py * cos;
      v[o++] = x;
      v[o++] = y;
      v[o++] = c & 1 ? u1 : u0;
      v[o++] = c < 2 ? vt : vb;
      v[o++] = heightAt(g, x) - y;
      v[o++] = f.x / A.w;
      v[o++] = f.y / A.h;
      v[o++] = (f.x + f.w) / A.w;
      v[o++] = (f.y + f.h) / A.h;
      v[o++] = reach;
      v[o++] = isGem(b.frame) ? 1 : 0;
    }
    return o;
  }

  /**
   * The hill behind: per column the top of its strip on ridgeAt, the bottom of its moss band along the normal, and
   * straight below that the bottom of its body, RIDGE_BURY under the floor's top (or the band's bottom, if that is
   * lower already: then the floor hides it all and the body is empty).
   */
  private buildRidge(g: Ground): void {
    const gl = this.gl;
    const v = this.ridgeVerts;
    const lift = LIFT * this.ridgeH;
    const band = RIDGE_MOSS * this.ridgeH;
    let arc = 0;
    let u0 = 0;
    let px = 0;
    let py = 0;
    for (let i = 0; i < this.cols; i++) {
      const x = WORLD.x0 - MARGIN + i * COL;
      const y = ridgeAt(g, x) + lift;
      if (i > 0) arc += Math.hypot(x - px, y - py);
      if (x <= 0) u0 = arc;
      px = x;
      py = y;
      const [nx, ny] = inward((x) => ridgeAt(g, x), x);
      const bx = x + nx * band;
      const by = y + ny * band;
      const fy = Math.min(by, heightAt(g, bx) - RIDGE_BURY);
      v.set([x, y, arc, 0, bx, by, arc, 1, bx, fy, arc, 1 + (by - fy) / band], i * 12);
    }
    for (let i = 0; i < this.cols * 3; i++) v[i * 4 + 2] = (v[i * 4 + 2]! - u0) / STRIP_TILE;
    if (!gl || this.lost || !this.ridgeVbo) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ridgeVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, v);
  }

  /** the scene target for the canvas as it is now and the current budget */
  private ensureTarget(gl: GL): Target {
    const k = this.budget.scale(this.cv.width, this.cv.height);
    const w = Math.max(1, Math.round(this.cv.width * k));
    const h = Math.max(1, Math.round(this.cv.height * k));
    if (this.scene && (this.scene.w !== w || this.scene.h !== h)) {
      freeTarget(gl, this.scene);
      this.scene = null;
    }
    return (this.scene ??= target(gl, w, h));
  }

  frame(dt: number): void {
    const gl = this.gl;
    if (
      !gl ||
      this.lost ||
      !this.shown ||
      !this.strip ||
      !this.soils ||
      !this.ridgeTex ||
      !this.mossFill ||
      !this.atlasTex.length ||
      !this.canopyTex.length
    )
      return;
    this.time += dt;
    this.budget.frame(dt);
    if (this.morph > 0 && this.goal) {
      this.morph = Math.max(0, this.morph - dt);
      this.shown = this.morph > 0 ? mixGround(this.shown, this.goal, 1 - Math.exp(-dt * 7)) : this.goal;
      this.build(this.shown);
      if (this.morph === 0) this.dropTrunks(this.goal);
    }
    this.clamp();
    const g = this.shown;
    const hh = this.viewH / 2;
    const hw = (hh * this.W) / this.H;
    const aspect = this.W / this.H;

    const t = this.ensureTarget(gl);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.viewport(0, 0, t.w, t.h);
    const p = this.p!;
    const c = this.common;
    c.uCam[0] = this.cam.x;
    c.uCam[1] = this.cam.y;
    c.uCam[2] = hw;
    c.uCam[3] = hh;
    c.uDrift = g.drift;
    c.uShadeMap = this.shadeTex;
    // painter's order as depth: first the canopy, opaque, front to back, writing it, unblended (a tiled GPU then
    // removes hidden pixels itself); then everything else back to front, tested against it but not writing it
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.BLEND);
    this.drawCanopy(g);
    gl.depthMask(false);

    // sky
    this.at(SLOT.sky);
    p.sky.use(c, { uLight: AIR.light, uTime: this.gentle ? 0 : this.time, uAspect: [aspect, 1] });
    gl.bindVertexArray(this.empty);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // the hill behind, then the floor in front of it: premultiplied over the sky
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    p.ridge.use(c, {
      uStrip: this.ridgeTex,
      uCellSeed: RIDGE_SEED,
      uMossEnd: RIDGE_MOSS,
      uShade: RIDGE_SHADE,
      uMossFill: this.mossFill,
      uMossTile: this.mossTile,
      uMossGain: this.mossGain,
    });
    gl.bindVertexArray(this.ridgeVao);
    this.at(SLOT.ridge);
    gl.drawElements(gl.TRIANGLES, this.ridgeCount, gl.UNSIGNED_SHORT, 0);

    p.ground.use(c, {
      uStrip: this.strip,
      uCellSeed: 0,
      uSoil: this.soils,
      uSoilTile: this.soilTile,
      uBands: g.bands,
      uSoilGain: this.soilGain,
      uFade: FADE,
      uMoss: MOSS,
    });
    gl.bindVertexArray(this.mesh);
    this.at(SLOT.ground);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);

    // the trunks, after the ground (their feet take the ground over in height blends), between their crowns' pieces
    this.drawTrunks(g);

    // what lies buried, over the soil: the treasures' halos, every shadow (dropped a little, blurred), then the
    // pictures; an atlas a draw
    const bu = p.buried;
    bu.use(c, { uDim: BURIED_DIM, uEarth: this.earth, uGemStain: GEM_STAIN, uGemLight: GEM_LIGHT, uTime: this.time });
    gl.bindVertexArray(this.buriedVao);
    this.at(this.slots - 1);
    // halos first, then every shadow, then the pictures, then the gems' glints (on the halo quads, room for their
    // rays; none with reduced motion): the things' quads per atlas, then the halos' per atlas
    const things = this.buriedCount.reduce((s, n) => s + n, 0);
    const passes: [number, number, number[], number][] = [
      [PASS.halo, HALO_DARK, this.haloCount, things],
      [PASS.shadow, SHADOW, this.buriedCount, 0],
      [PASS.picture, 0, this.buriedCount, 0],
    ];
    if (!this.gentle) passes.push([PASS.glint, 0, this.haloCount, things]);
    for (const [pass, dark, counts, start] of passes) {
      bu.set({ uPass: pass, uDark: dark, uOffset: [0, pass === PASS.shadow ? -SHADOW_DROP : 0] });
      let first = start;
      counts.forEach((n, a) => {
        if (!n) return;
        bu.set({ uAtlas: this.atlasTex[a]! });
        gl.drawElements(gl.TRIANGLES, n * 6, gl.UNSIGNED_SHORT, first * 12);
        first += n;
      });
    }

    // post: onto the canvas
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.depthRange(0, 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.cv.width, this.cv.height);
    p.post.use(null, { uScene: t.tex, uAspect: [aspect, 1], uSeed: this.gentle ? 0 : (this.time * 97.13) % 1000 });
    gl.bindVertexArray(this.empty);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (this.wire) this.drawWire();
    gl.bindVertexArray(null);
  }

  /**
   * The canopy, all opaque, front to back, each piece at its depth: first every piece's body, then every fringe of
   * hanging leaves, cut out at their edges. A pixel is shaded by the nearest piece only, a cut-out one where its
   * leaves are thin; the bodies go first, unbroken by cut-outs, so a tiled GPU hides what lies behind them itself.
   */
  private drawCanopy(g: Ground): void {
    const gl = this.gl!;
    const p = this.p!;
    for (const [cr, first, count] of [
      [p.crown, 0, this.crownBody],
      [p.crownFringe, this.crownBody, this.crownIdx - this.crownBody],
    ] as const) {
      cr.use(this.common, {
        uPieces: this.pieces,
        uPieceShape: this.pieceShape,
        uPieceCount: this.pieceCount,
        uPieceLayer: SHADE_PIECE,
        uPieceShade: this.pieceShade,
        uCellSeed: CROWN_SEED,
      });
      gl.bindVertexArray(this.crownVao);
      let tree = -1;
      for (let i = this.order.length - 1; i >= 0; i--) {
        const s = this.order[i]!;
        if (s.piece < 0) continue;
        if (s.tree !== tree) this.leaves(g, s, cr);
        tree = s.tree;
        this.at(s.slot);
        gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, (s.piece * this.crownIdx + first) * 2);
      }
    }
  }

  /**
   * The trunks, tree by tree from the back (forestOrder), each at its depth between its crown's pieces: the ground
   * projected onto its foot, its picture and its grade, blended over what lies behind, hidden where leaves in front
   * cover it. A tree further back fades into the air.
   */
  private drawTrunks(g: Ground): void {
    const gl = this.gl!;
    const tr = this.p!.tree;
    tr.use(this.common, {
      uSink: SINK,
      uStrip: this.strip,
      uCellSeed: 0,
      uMossFill: this.mossFill,
      uMossTile: this.mossTile,
      uMossGain: this.floorMossGain,
      uGroundAt: this.groundAtTex,
      uGroundCols: [WORLD.x0 - MARGIN, COL],
      uLift: LIFT * this.stripH,
      uMossV: MOSS,
    });
    gl.bindVertexArray(this.treeVao);
    for (const s of this.order) {
      if (s.piece >= 0) continue;
      const t = g.trees[s.tree]!;
      this.at(s.slot);
      tr.set({
        uTree: this.trunkTex.get(t.trunk)!.picture,
        uRelief: this.trunkTex.get(t.trunk)!.relief,
        uSeed: t.seed,
        uGrade: [...t.tint, t.saturation],
        uClimb: t.climb,
        uShadeLayer: SHADE_TRUNK + s.tree,
        uHaze: HAZE * t.depth,
      });
      gl.drawElements(gl.TRIANGLES, this.treeIdx, gl.UNSIGNED_SHORT, s.tree * this.treeIdx * 2);
    }
  }

  /** step s's crown in program p (in use): its kind of leaves, its season and its shade of it */
  private leaves(g: Ground, s: Step, p: Program): void {
    const t = g.trees[s.tree]!;
    const kind = t.leaves;
    p.set({
      uStrip: this.canopyTex[kind]!,
      uLeafFill: this.leafTex[kind]!,
      uSolid: this.canopySolid[kind]!,
      uLeafTile: LEAF_FILL[kind]!.w * LEAF_FILL[kind]!.s * LEAF_SCALE,
      uLeafGain: this.leafGain[kind]!,
      uLeafLuma: this.leafLuma[kind]!,
      uLeafKind: kind,
      uSeason: g.crown.seasons[s.tree]!,
      uFoliage: t.foliage,
      uHaze: HAZE * t.depth,
    });
  }

  /** draws from here on lie at this slot's depth (SLOT; every vertex shader puts z at 0, so the range is the depth) */
  private at(slot: number): void {
    const d = 1 - (slot + 1) / (this.slots + 1);
    this.gl!.depthRange(d, d);
  }

  /**
   * The canopy's shade, baked into the shade map once per forest instead of every pixel of every frame looping over
   * the pieces: the floor's layer (every piece's column shade, at the floor's strength), each trunk's (every piece's,
   * and the occlusion by the pieces drawn after it), each piece's (its own crown's other pieces, as in a crown standing
   * alone, and the occlusion by the pieces drawn after it).
   */
  private bakeShade(): void {
    const gl = this.gl;
    const sh = this.p?.shade;
    if (!gl || this.lost || !sh || !this.shadeFbo) return;
    const n = this.pieceCount;
    const hw = (SHADE_W * SHADE_TEXEL) / 2;
    const hh = (SHADE_H * SHADE_TEXEL) / 2;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadeFbo);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    sh.use(null, { uCam: [WORLD.x0 + hw, WORLD.bottom + hh, hw, hh], uPieces: this.pieces, uPieceShape: this.pieceShape, uPieceCount: n });
    gl.bindVertexArray(this.empty);
    gl.enable(gl.SCISSOR_TEST);
    // layer i: its tile as the viewport (the full-screen triangle spans the world in it), the scissor within it
    const layer = (i: number, dark: number, cast: [number, number, number], first: number, box: [number, number, number, number]) => {
      const x = (i % SHADE_COLS) * SHADE_W;
      const y = Math.floor(i / SHADE_COLS) * SHADE_H;
      gl.viewport(x, y, SHADE_W, SHADE_H);
      gl.scissor(x + box[0], y + box[1], box[2], box[3]);
      sh.set({ uCrownShadow: dark, uCast: cast, uFirst: first });
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    // a trunk's or a piece's layer is only ever read where it is drawn: baked within its mesh's bounds; the floor's
    // everywhere
    layer(0, FLOOR_SHADOW, [0, n, -1], n, [0, 0, SHADE_W, SHADE_H]);
    for (const s of this.order) {
      if (s.piece < 0)
        layer(
          SHADE_TRUNK + s.tree,
          CROWN_SHADOW,
          [0, n, -1],
          s.first,
          shadeBox(this.treeVerts, s.tree * TREE_VERTS, TREE_VERTS, TREE_STRIDE),
        );
      else
        layer(
          SHADE_PIECE + s.piece,
          CROWN_SHADOW,
          [s.start, s.end, s.piece],
          s.piece + 1,
          shadeBox(this.crownVerts, s.piece * CROWN_VERTS, CROWN_VERTS, CROWN_STRIDE),
        );
    }
    gl.disable(gl.SCISSOR_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** the materials the wireframe colours, with their triangles: what the legend lists */
  wireLegend(): WireMaterial[] {
    const quads = this.cols - 1;
    return [
      { name: 'sky.frag · full-screen', color: WIRE_COLOR.sky, tris: 1 },
      { name: 'ridge.frag · moss band', color: WIRE_COLOR.band, tris: quads * 2 },
      { name: 'ridge.frag · moss body', color: WIRE_COLOR.body, tris: quads * 2 },
      { name: 'ground.frag · strip', color: WIRE_COLOR.strip, tris: quads * 2 },
      { name: 'ground.frag · soil', color: WIRE_COLOR.soil, tris: quads * 2 },
      { name: 'tree.frag · trees', color: WIRE_COLOR.tree, tris: (this.treeCount * this.treeIdx) / 3 },
      { name: 'crown.frag · canopy pieces', color: WIRE_COLOR.crown, tris: (this.pieceCount * this.crownIdx) / 3 },
      // drawn twice unless motion is reduced: halo, then the gems' glints
      {
        name: 'buried.frag · halos, glints',
        color: WIRE_COLOR.halo,
        tris: this.haloCount.reduce((s, n) => s + n, 0) * (this.gentle ? 2 : 4),
      },
      // drawn twice: shadow, then picture
      { name: 'buried.frag · treasure, stones', color: WIRE_COLOR.buried, tris: this.buriedCount.reduce((s, n) => s + n, 0) * 4 },
      { name: 'post.frag · full-screen', color: WIRE_COLOR.post, tris: 1 },
    ];
  }

  /**
   * Every draw's edges, on the canvas over the finished picture, in its layer's colour. The full-screen
   * triangles of sky and post are the same one (corners -1,-1 / 3,-1 / -1,3): its edges run along the screen's
   * left and bottom borders and off screen, so at most a line on the border shows; the legend lists them anyway.
   */
  private drawWire(): void {
    const gl = this.gl!;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const s = this.p!.wireScreen;
    s.use(null);
    gl.bindVertexArray(this.empty);
    for (const c of [WIRE_COLOR.post, WIRE_COLOR.sky]) {
      s.set({ uColor: c });
      gl.drawArrays(gl.LINE_LOOP, 0, 3);
    }
    const w = this.p!.wire;
    w.use(this.common);
    gl.bindVertexArray(this.wireRidgeVao);
    w.set({ uColor: WIRE_COLOR.body });
    gl.drawElements(gl.LINES, this.wireBody, gl.UNSIGNED_SHORT, this.wireBand * 2);
    w.set({ uColor: WIRE_COLOR.band });
    gl.drawElements(gl.LINES, this.wireBand, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(this.wireVao);
    w.set({ uColor: WIRE_COLOR.strip });
    gl.drawElements(gl.LINES, this.wireStrip, gl.UNSIGNED_SHORT, 0);
    w.set({ uColor: WIRE_COLOR.soil });
    gl.drawElements(gl.LINES, this.wireSoil, gl.UNSIGNED_SHORT, this.wireStrip * 2);
    gl.bindVertexArray(this.wireTreeVao);
    w.set({ uColor: WIRE_COLOR.tree });
    gl.drawElements(gl.LINES, this.treeCount * this.wireTreeIdx, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(this.wireCrownVao);
    w.set({ uColor: WIRE_COLOR.crown });
    gl.drawElements(gl.LINES, this.pieceCount * this.wireCrownIdx, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(this.wireBuriedVao);
    w.set({ uColor: WIRE_COLOR.buried });
    const things = this.buriedCount.reduce((s, n) => s + n, 0);
    gl.drawElements(gl.LINES, things * 10, gl.UNSIGNED_SHORT, 0);
    w.set({ uColor: WIRE_COLOR.halo });
    gl.drawElements(gl.LINES, this.haloCount.reduce((s, n) => s + n, 0) * 10, gl.UNSIGNED_SHORT, things * 20);
    gl.disable(gl.BLEND);
  }
}
