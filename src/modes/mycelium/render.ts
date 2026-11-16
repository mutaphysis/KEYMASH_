// MYCELIUM_'s picture: a side view of the forest floor in WebGL2, panned in x and y. Layers are drawn back to
// front into a target sized by the pixel budget, then finished onto the canvas:
//   sky     the air behind everything (full screen)
//   ridge   a mossy hill behind the floor: rounded moss cushions whose tops clear the floor (ground.ts, ridgeAt),
//           a second strip's moss band handing over to a hex-tiled moss carpet below
//   ground  the moss-and-soil strip bent along the curve, handing over to the hex-tiled soil horizons (one mesh)
//   post    contrast, vignette, grain
//   wire    debug only (dev builds' wireframe button): every draw's edges, one colour per shader or material
// Shaders live in shaders/, one file per piece.
import type { Assets } from './assets';
import { WORLD, heightAt, mixGround, mossAt, ridgeAt } from './ground';
import type { Ground } from './ground';
import { freeTarget, program, target, texture, textureArray } from './gl';
import type { GL, Program, Target } from './gl';
import { GROUND_FS, GROUND_VS, POST_FS, RIDGE_FS, RIDGE_VS, SCREEN_VS, SKY_FS, WIRE_FS, WIRE_VS } from './shaders';
import { PixelBudget } from '../../ui/budget';

type RGB = [number, number, number];
type RGBA = [number, number, number, number];

/** debug wireframe: one colour per shader or material (straight RGBA); `tris` per draw, as drawn */
export interface WireMaterial {
  name: string;
  color: RGBA;
  tris: number;
}
const WIRE_COLOR: Record<'sky' | 'band' | 'body' | 'strip' | 'soil' | 'post', RGBA> = {
  sky: [0.35, 0.8, 1, 0.9],
  band: [0.25, 1, 0.85, 0.85],
  body: [0.2, 0.55, 1, 0.85],
  strip: [0.55, 1, 0.35, 0.85],
  soil: [1, 0.62, 0.2, 0.85],
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

  private sky: Program | null = null;
  private ground: Program | null = null;
  private post: Program | null = null;
  private empty: WebGLVertexArrayObject | null = null;
  private mesh: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private count = 0;
  private ridge: Program | null = null;
  private ridgeVao: WebGLVertexArrayObject | null = null;
  private ridgeVbo: WebGLBuffer | null = null;
  private ridgeCount = 0;
  private wireRidgeVao: WebGLVertexArrayObject | null = null;
  /** line indices: the band rows' edges first, then the body rows' */
  private wireBand = 0;
  private wireBody = 0;
  private wireP: Program | null = null;
  private wireScreen: Program | null = null;
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

  /** the ground drawn now, the one it eases toward, and how long that still takes */
  private shown: Ground | null = null;
  private goal: Ground | null = null;
  private morph = 0;
  private verts: Float32Array;
  /** the hill: per column its top, the bottom of its moss band, the bottom of its body; position, uv */
  private ridgeVerts: Float32Array;
  private cols: number;

  constructor(cv: HTMLCanvasElement) {
    this.cv = cv;
    this.gl = cv.getContext('webgl2', { alpha: false, antialias: false, depth: false, premultipliedAlpha: true });
    this.ok = !!this.gl;
    this.budget = new PixelBudget(undefined, typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches ? 0 : TOUCH);
    this.cols = Math.floor((WORLD.x1 - WORLD.x0 + 2 * MARGIN) / COL) + 1;
    this.verts = new Float32Array(this.cols * 3 * STRIDE);
    this.ridgeVerts = new Float32Array(this.cols * 3 * 4);
    cv.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
      this.scene = null;
    });
    cv.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this.setup();
      if (this.assets) this.upload(this.assets);
      if (this.shown) this.build(this.shown);
    });
    this.setup();
  }

  /** programs and buffers; again after a lost context */
  private setup(): void {
    const gl = this.gl;
    if (!gl) return;
    this.sky = program(gl, SCREEN_VS, SKY_FS);
    this.ground = program(gl, GROUND_VS, GROUND_FS);
    this.post = program(gl, SCREEN_VS, POST_FS);
    this.empty = gl.createVertexArray();
    this.mesh = gl.createVertexArray();
    this.vbo = gl.createBuffer();
    gl.bindVertexArray(this.mesh);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.verts.byteLength, gl.DYNAMIC_DRAW);
    // pos xy, uv, depth, where the moss ends
    const B = STRIDE * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, B, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, B, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, B, 16);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, B, 20);
    // two quads per column pair: strip (rows 0–1) and soil below it (rows 1–2)
    const idx = new Uint16Array((this.cols - 1) * 12);
    for (let i = 0, n = 0; i + 1 < this.cols; i++) {
      const a = i * 3;
      const b = a + 3;
      for (const r of [0, 1]) idx.set([a + r, a + r + 1, b + r, b + r, a + r + 1, b + r + 1], n + r * 6);
      n += 12;
    }
    this.count = idx.length;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    // debug wireframe: the same vertices, their edges as lines; row 1's horizontals count as strip
    this.wireP = program(gl, WIRE_VS, WIRE_FS);
    this.wireScreen = program(gl, SCREEN_VS, WIRE_FS);
    this.wireVao = gl.createVertexArray();
    gl.bindVertexArray(this.wireVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, B, 0);
    const strip: number[] = [];
    const soil: number[] = [];
    for (let i = 0; i < this.cols; i++) {
      const a = i * 3;
      const b = a + 3;
      strip.push(a, a + 1);
      soil.push(a + 1, a + 2);
      if (i + 1 < this.cols) {
        strip.push(a, b, a + 1, b + 1, a + 1, b);
        soil.push(a + 2, b + 2, a + 2, b + 1);
      }
    }
    this.wireStrip = strip.length;
    this.wireSoil = soil.length;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([...strip, ...soil]), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    // the hill: three rows per column (band, body), two quads per column pair; pos xy, uv
    this.ridge = program(gl, RIDGE_VS, RIDGE_FS);
    this.ridgeVao = gl.createVertexArray();
    this.ridgeVbo = gl.createBuffer();
    gl.bindVertexArray(this.ridgeVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ridgeVbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.ridgeVerts.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
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
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ridx, gl.STATIC_DRAW);
    this.wireRidgeVao = gl.createVertexArray();
    gl.bindVertexArray(this.wireRidgeVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ridgeVbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    this.wireBand = band.length;
    this.wireBody = body.length;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([...band, ...body]), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
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
  }

  /** a new ground: eases in from the one shown, or snaps (`now`, or nothing shown yet) */
  setGround(g: Ground, now = false): void {
    this.goal = g;
    if (now || !this.shown || this.gentle) {
      this.shown = g;
      this.morph = 0;
      this.build(g);
    } else this.morph = MORPH;
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
    }
    // arc length → strip repeats, from x = 0
    for (let i = 0; i < this.cols * 3; i++) v[i * STRIDE + 2] = (v[i * STRIDE + 2]! - u0) / this.stripW;
    this.buildRidge(g);
    if (!gl || this.lost || !this.vbo) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, v);
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
    if (!gl || this.lost || !this.shown || !this.strip || !this.soils || !this.ridgeTex || !this.mossFill) return;
    this.time += dt;
    this.budget.frame(dt);
    if (this.morph > 0 && this.goal) {
      this.morph = Math.max(0, this.morph - dt);
      this.shown = this.morph > 0 ? mixGround(this.shown, this.goal, 1 - Math.exp(-dt * 7)) : this.goal;
      this.build(this.shown);
    }
    this.clamp();
    const g = this.shown;
    const hh = this.viewH / 2;
    const hw = (hh * this.W) / this.H;
    const aspect = this.W / this.H;

    const t = this.ensureTarget(gl);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.viewport(0, 0, t.w, t.h);
    gl.disable(gl.DEPTH_TEST);

    // sky
    gl.disable(gl.BLEND);
    const sky = this.sky!;
    gl.useProgram(sky.prog);
    gl.uniform4f(sky.u.uCam!, this.cam.x, this.cam.y, hw, hh);
    gl.uniform3f(sky.u.uSkyHigh!, ...AIR.skyHigh);
    gl.uniform3f(sky.u.uSkyLow!, ...AIR.skyLow);
    gl.uniform3f(sky.u.uLight!, ...AIR.light);
    gl.uniform1f(sky.u.uTime!, this.gentle ? 0 : this.time);
    gl.uniform2f(sky.u.uAspect!, aspect, 1);
    gl.bindVertexArray(this.empty);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // the hill behind, then the floor in front of it: premultiplied over the sky
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const ri = this.ridge!;
    gl.useProgram(ri.prog);
    gl.uniform4f(ri.u.uCam!, this.cam.x, this.cam.y, hw, hh);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.ridgeTex);
    gl.uniform1i(ri.u.uStrip!, 0);
    gl.uniform1f(ri.u.uCellSeed!, RIDGE_SEED);
    gl.uniform1f(ri.u.uMossEnd!, RIDGE_MOSS);
    gl.uniform1f(ri.u.uShade!, RIDGE_SHADE);
    gl.uniform3f(ri.u.uTint!, ...AIR.tint);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.mossFill);
    gl.uniform1i(ri.u.uMossFill!, 1);
    gl.uniform1f(ri.u.uMossTile!, this.mossTile);
    gl.uniform3f(ri.u.uMossGain!, ...this.mossGain);
    gl.bindVertexArray(this.ridgeVao);
    gl.drawElements(gl.TRIANGLES, this.ridgeCount, gl.UNSIGNED_SHORT, 0);

    const gr = this.ground!;
    gl.useProgram(gr.prog);
    gl.uniform1f(gr.u.uCellSeed!, 0);
    gl.uniform4f(gr.u.uCam!, this.cam.x, this.cam.y, hw, hh);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.strip);
    gl.uniform1i(gr.u.uStrip!, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.soils);
    gl.uniform1i(gr.u.uSoil!, 1);
    gl.uniform1f(gr.u.uSoilTile!, this.soilTile);
    gl.uniform3f(gr.u.uBands!, ...g.bands);
    gl.uniform2f(gr.u.uDrift!, ...g.drift);
    gl.uniform3f(gr.u.uSoilGain!, ...this.soilGain);
    gl.uniform3f(gr.u.uDeep!, ...AIR.deep);
    gl.uniform3f(gr.u.uFade!, ...FADE);
    gl.uniform1f(gr.u.uMoss!, MOSS);
    gl.uniform3f(gr.u.uTint!, ...AIR.tint);
    gl.bindVertexArray(this.mesh);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);

    // post: onto the canvas
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.cv.width, this.cv.height);
    const post = this.post!;
    gl.useProgram(post.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.uniform1i(post.u.uScene!, 0);
    gl.uniform2f(post.u.uAspect!, aspect, 1);
    gl.uniform1f(post.u.uSeed!, this.gentle ? 0 : (this.time * 97.13) % 1000);
    gl.bindVertexArray(this.empty);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (this.wire) this.drawWire(hw, hh);
    gl.bindVertexArray(null);
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
      { name: 'post.frag · full-screen', color: WIRE_COLOR.post, tris: 1 },
    ];
  }

  /**
   * Every draw's edges, on the canvas over the finished picture, in its layer's colour. The full-screen
   * triangles of sky and post are the same one (corners -1,-1 / 3,-1 / -1,3): its edges run along the screen's
   * left and bottom borders and off screen, so at most a line on the border shows; the legend lists them anyway.
   */
  private drawWire(hw: number, hh: number): void {
    const gl = this.gl!;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const s = this.wireScreen!;
    gl.useProgram(s.prog);
    gl.bindVertexArray(this.empty);
    for (const c of [WIRE_COLOR.post, WIRE_COLOR.sky]) {
      gl.uniform4f(s.u.uColor!, ...c);
      gl.drawArrays(gl.LINE_LOOP, 0, 3);
    }
    const w = this.wireP!;
    gl.useProgram(w.prog);
    gl.uniform4f(w.u.uCam!, this.cam.x, this.cam.y, hw, hh);
    gl.bindVertexArray(this.wireRidgeVao);
    gl.uniform4f(w.u.uColor!, ...WIRE_COLOR.body);
    gl.drawElements(gl.LINES, this.wireBody, gl.UNSIGNED_SHORT, this.wireBand * 2);
    gl.uniform4f(w.u.uColor!, ...WIRE_COLOR.band);
    gl.drawElements(gl.LINES, this.wireBand, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(this.wireVao);
    gl.uniform4f(w.u.uColor!, ...WIRE_COLOR.strip);
    gl.drawElements(gl.LINES, this.wireStrip, gl.UNSIGNED_SHORT, 0);
    gl.uniform4f(w.u.uColor!, ...WIRE_COLOR.soil);
    gl.drawElements(gl.LINES, this.wireSoil, gl.UNSIGNED_SHORT, this.wireStrip * 2);
    gl.disable(gl.BLEND);
  }
}
