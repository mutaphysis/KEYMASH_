// MYCELIUM_'s picture: a side view of the forest floor in WebGL2, panned in x and y. Layers are drawn back to
// front into a target sized by the pixel budget, then finished onto the canvas:
//   sky     the air behind everything (full screen)
//   ground  the moss-and-soil strip bent along the curve, handing over to the hex-tiled soil horizons (one mesh)
//   post    contrast, vignette, grain
// Shaders live in shaders/, one file per piece.
import type { Assets } from './assets';
import { WORLD, heightAt, mixGround, mossAt } from './ground';
import type { Ground } from './ground';
import { freeTarget, program, target, texture, textureArray } from './gl';
import type { GL, Program, Target } from './gl';
import { GROUND_FS, GROUND_VS, POST_FS, SCREEN_VS, SKY_FS } from './shaders';
import { PixelBudget } from '../../ui/budget';

type RGB = [number, number, number];

/** view units from the top of the stage to the bottom, whatever its size */
export const VIEW_H = 720;
/** where the forest floor sits when the camera is at rest: this share of the view from the top */
const FLOOR_AT = 0.38;
/** one strip width covers this much of the curve: 0.378 units per texel, the scale the soils are packed at too */
const STRIP_TILE = 520;
/** columns of the ground mesh, this far apart */
const COL = 8;
/** the mesh reaches this far past the world's sides: the strip's bottom leans with the slope, so where the columns end
 * the soil below them would stop short of the view's edge */
const MARGIN = 320;
/** the strip's top edge sits this far above the curve: its clear rows above the moss */
const LIFT = 22;
/** where the moss ends in the strip picture (v, measured off assets/tex-ground.webp: below it, no green) */
const MOSS = 0.57;
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
  private strip: WebGLTexture | null = null;
  private soils: WebGLTexture | null = null;
  private stripW = 1;
  private stripH = 1;
  private soilTile = 1;
  private soilGain: RGB = [1, 1, 1];

  /** the ground drawn now, the one it eases toward, and how long that still takes */
  private shown: Ground | null = null;
  private goal: Ground | null = null;
  private morph = 0;
  private verts: Float32Array;
  private cols: number;

  constructor(cv: HTMLCanvasElement) {
    this.cv = cv;
    this.gl = cv.getContext('webgl2', { alpha: false, antialias: false, depth: false, premultipliedAlpha: true });
    this.ok = !!this.gl;
    this.budget = new PixelBudget(undefined, typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches ? 0 : TOUCH);
    this.cols = Math.floor((WORLD.x1 - WORLD.x0 + 2 * MARGIN) / COL) + 1;
    this.verts = new Float32Array(this.cols * 3 * STRIDE);
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
    let arc = 0;
    let u0 = 0;
    let px = 0;
    let py = 0;
    for (let i = 0; i < this.cols; i++) {
      const x = WORLD.x0 - MARGIN + i * COL;
      const y = heightAt(g, x) + LIFT;
      if (i > 0) arc += Math.hypot(x - px, y - py);
      // u counts from x = 0, so an edited ground slides the texture least where the camera starts
      if (x <= 0) u0 = arc;
      px = x;
      py = y;
      // the normal into the ground, blended with straight down so steep bits don't fold over
      const ty = heightAt(g, x + COL) - heightAt(g, x - COL);
      const tl = Math.hypot(2 * COL, ty);
      let nx = (ty / tl) * 0.6;
      let ny = ((-2 * COL) / tl) * 0.6 - 0.4;
      const nl = Math.hypot(nx, ny);
      nx /= nl;
      ny /= nl;
      const s = mossAt(g, x);
      const Hc = H * (MOSS * s + 1 - MOSS);
      const m = (MOSS * s) / (MOSS * s + 1 - MOSS);
      const bx = x + nx * Hc;
      const by = y + ny * Hc;
      const o = i * 3 * STRIDE;
      v.set([x, y, arc, 0, -LIFT, m], o);
      v.set([bx, by, arc, 1, heightAt(g, bx) - by, m], o + STRIDE);
      v.set([bx, WORLD.bottom, arc, 1 + (by - WORLD.bottom) / Hc, heightAt(g, bx) - WORLD.bottom, m], o + 2 * STRIDE);
    }
    // arc length → strip repeats, from x = 0
    for (let i = 0; i < this.cols * 3; i++) v[i * STRIDE + 2] = (v[i * STRIDE + 2]! - u0) / this.stripW;
    if (!gl || this.lost || !this.vbo) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
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
    if (!gl || this.lost || !this.shown || !this.strip || !this.soils) return;
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

    // ground: premultiplied over the sky
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const gr = this.ground!;
    gl.useProgram(gr.prog);
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
    gl.bindVertexArray(null);
  }
}
