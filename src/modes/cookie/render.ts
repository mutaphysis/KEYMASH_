// COOKIE_'s picture: the bakery as a raymarched scene in WebGL2. Three passes: the scene into a
// smaller target (its size follows the frame rate), crumbs on top against the scene's depth, then
// the target stretched over the canvas.
import type { Bakery } from './bakery';
import { CUTTER_UP, DOUGH } from './bakery';
import { DOUGHS } from './recipe';
import type { Recipe, RGB, Stage, Topping } from './recipe';
import { anchors, distanceTransform, FIELD_EXT, FIELD_N } from './shapes';
import type { Field } from './shapes';
import { program, uniforms, target, freeTarget, perspective, lookAt, mul } from './gl';
import type { GL, Target, Uniforms, Vec3 } from './gl';
import { FULL_VS, SCENE_FS, CRUMB_VS, CRUMB_FS, BLIT_FS } from './shader';
import { ROUNDED } from './theme.css';

const FOV = (38 * Math.PI) / 180;
const TAN = Math.tan(FOV / 2);
const DEG = Math.PI / 180;
const TEXEL = (2 * FIELD_EXT) / FIELD_N;
/** pixels of the scene target; a slow device steps down, never up */
const BUDGETS = [420000, 300000, 210000, 150000];
const ELEV: Record<Stage, number> = {
  drop: 30,
  roll: 40,
  cut: 52,
  chips: 55,
  bake: 48,
  cool: 52,
  coat: 60,
  pattern: 60,
  toppings: 60,
  deco: 60,
  present: 60,
  serve: 66,
  sweep: 50,
};
const TOP_KIND: Record<Topping, number> = { sprinkles: 1, sugar: 2, strands: 3, pearls: 4 };
const COAT_KIND = { none: 0, icing: 1, chocolate: 2, glaze: 3 };
const FLOW_KIND = { thick: 0, smooth: 1, runny: 2 };
const COAT_SHAPE = { thick: [0.045, 0.13], smooth: [0.03, 0.09], runny: [0.02, 0.02] };
const PATTERN_KIND = { plain: 0, stripes: 1, zigzag: 2, swirl: 3, half: 0 };

const lin = (c: RGB): Vec3 => [c[0] ** 2.2, c[1] ** 2.2, c[2] ** 2.2];
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const sat = (v: number) => Math.max(0, Math.min(1, v));

interface Cam {
  pos: Vec3;
  right: Vec3;
  up: Vec3;
  fwd: Vec3;
  viewProj: Float32Array;
  shift: number;
}

export class CookieRenderer {
  /** false: no WebGL2 */
  readonly ok: boolean;
  gentle = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** CSS pixels at the bottom of the stage covered by the play buttons */
  reserveBottom = 0;
  /** CSS pixels above the play buttons taken by the greeting while it shows; the camera eases into the space left */
  reserveGreet = 0;
  private greetPx = 0;
  /** 1; the sheet pictures set it */
  zoom = 1;

  private cv: HTMLCanvasElement;
  private gl: GL | null;
  private lost = false;
  private W = 1;
  private H = 1;
  private scene: WebGLProgram | null = null;
  private sceneU: Uniforms = {};
  private crumb: WebGLProgram | null = null;
  private crumbU: Uniforms = {};
  private blit: WebGLProgram | null = null;
  private blitU: Uniforms = {};
  private tgt: Target | null = null;
  private budget: number;
  private atlas: WebGLTexture | null = null;
  private uploaded: (Field | null)[] = [null, null, null];
  private versions = [-1, -1, -1];
  private fullVao: WebGLVertexArrayObject | null = null;
  private crumbVao: WebGLVertexArrayObject | null = null;
  private crumbBuf: WebGLBuffer | null = null;
  private crumbData = new Float32Array(0);
  private pen: CanvasRenderingContext2D | null = null;
  private decoBatch = -1;
  private decoRecipe: Recipe | null = null;
  private el = 40 * DEG;
  private dist = 12;
  private time = 0;
  private cam: Cam | null = null;
  private lastNow = 0;
  private times: number[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.cv = canvas;
    this.budget = typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches ? 0 : 1;
    this.gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    this.ok = !!this.gl;
    if (!this.gl) return;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this.build();
    });
    this.build();
  }

  /** everything that lives in the GL context; again after the context came back */
  private build(): void {
    const gl = this.gl!;
    this.scene = program(gl, FULL_VS, SCENE_FS);
    this.sceneU = uniforms(gl, this.scene);
    this.crumb = program(gl, CRUMB_VS, CRUMB_FS);
    this.crumbU = uniforms(gl, this.crumb);
    this.blit = program(gl, FULL_VS, BLIT_FS);
    this.blitU = uniforms(gl, this.blit);
    this.tgt = null;

    this.atlas = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 3 * FIELD_N, FIELD_N, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.uploaded = [null, null, null];

    this.fullVao = gl.createVertexArray();
    this.crumbVao = gl.createVertexArray();
    gl.bindVertexArray(this.crumbVao);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.crumbBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.crumbBuf);
    for (const loc of [1, 2]) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 32, (loc - 1) * 16);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);
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
  }

  /** the scene target for the canvas as it is now and the current budget */
  private fitTarget(): Target {
    const gl = this.gl!;
    const scale = Math.min(1, Math.sqrt(BUDGETS[this.budget]! / (this.cv.width * this.cv.height)));
    const w = Math.max(2, Math.round(this.cv.width * scale));
    const h = Math.max(2, Math.round(this.cv.height * scale));
    if (!this.tgt || this.tgt.w !== w || this.tgt.h !== h) {
      if (this.tgt) freeTarget(gl, this.tgt);
      this.tgt = target(gl, w, h);
    }
    return this.tgt;
  }

  /** where the camera wants to be: elevation, and the nearest distance that shows the whole tray above the play buttons */
  private aim(b: Bakery): [number, number] {
    const L = b.look;
    const el = (b.stage === 'present' ? mix(ELEV.deco, ELEV.serve, L.hero) : ELEV[b.stage]) * DEG;
    // half width and half depth of what must be seen: the whole sheet, later only the cookies
    const rim = 1.25 * b.recipe.size;
    const sheet = L.gap < 2;
    const X = sheet ? b.sheetR : Math.max(...b.cookies.map((c) => Math.abs(c.x)), 0) + rim;
    const Z = sheet ? b.sheetR : Math.max(...b.cookies.map((c) => Math.abs(c.z)), 0) + rim;
    const usable = Math.max(0.3, (this.H - this.reserve()) / this.H);
    const tall = Z * Math.sin(el) + (b.stage === 'drop' ? 3 * Math.cos(el) : 0.3);
    const dist = Math.max(X / (TAN * (this.W / this.H)), tall / (TAN * usable)) + Z * Math.cos(el) * 0.6;
    return [el, (dist * 1.08) / Math.max(0.1, this.zoom)];
  }

  /** jump the camera to where it wants to be (first frame, sheet pictures) */
  snap(b: Bakery): void {
    this.greetPx = this.reserveGreet;
    [this.el, this.dist] = this.aim(b);
  }

  private reserve(): number {
    return this.reserveBottom + this.greetPx;
  }

  private camera(): Cam {
    const az = this.gentle ? 0 : 4 * DEG * Math.sin(0.25 * this.time);
    const at: Vec3 = [0, 0.15, 0];
    const ce = Math.cos(this.el);
    const pos: Vec3 = [at[0] + this.dist * Math.sin(az) * ce, at[1] + this.dist * Math.sin(this.el), at[2] + this.dist * Math.cos(az) * ce];
    const view = lookAt(pos, at, [0, 1, 0]);
    const shift = this.reserve() / this.H;
    const proj = perspective(FOV, this.W / this.H, 0.1, 200);
    // the look-at point sits in the middle of what the play buttons leave free
    const vp = mul(proj, view);
    for (let c = 0; c < 4; c++) vp[c * 4 + 1] = vp[c * 4 + 1]! + shift * vp[c * 4 + 3]!;
    return {
      pos,
      right: [view[0]!, view[4]!, view[8]!],
      up: [view[1]!, view[5]!, view[9]!],
      fwd: [-view[2]!, -view[6]!, -view[10]!],
      viewProj: vp,
      shift,
    };
  }

  /** a ray through a point of the canvas, for bites */
  ray(cssX: number, cssY: number): [number, number, number, number, number, number] {
    const c = this.cam ?? this.camera();
    const x = (cssX / this.W) * 2 - 1;
    const y = 1 - (cssY / this.H) * 2 - c.shift;
    const k = TAN * (this.W / this.H);
    const d: Vec3 = [
      c.fwd[0] + c.right[0] * x * k + c.up[0] * y * TAN,
      c.fwd[1] + c.right[1] * x * k + c.up[1] * y * TAN,
      c.fwd[2] + c.right[2] * x * k + c.up[2] * y * TAN,
    ];
    const l = Math.hypot(d[0], d[1], d[2]) || 1;
    return [c.pos[0], c.pos[1], c.pos[2], d[0] / l, d[1] / l, d[2] / l];
  }

  /** letters and the mouth are piped: drawn small, turned into distances, stored in each cookie's field */
  private pipeDeco(b: Bakery): void {
    const r = b.recipe;
    this.decoBatch = b.batch;
    this.decoRecipe = r;
    const mouth = r.face === 'smile' || r.face === 'frown';
    if (!r.letters.length && !mouth) return;
    if (!this.pen) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = FIELD_N;
      this.pen = cv.getContext('2d', { willReadFrequently: true });
    }
    const g = this.pen;
    if (!g) return;
    const a = anchors(r.shape, r.variant, r.face !== 'none');
    const px = (x: number) => (x + FIELD_EXT) / TEXEL;
    const py = (y: number) => (FIELD_EXT - y) / TEXEL;
    g.fillStyle = '#000';
    g.fillRect(0, 0, FIELD_N, FIELD_N);
    g.fillStyle = g.strokeStyle = '#fff';
    if (r.letters.length) {
      const text = r.letters.join('');
      const font = (size: number) => `900 ${size}px ${ROUNDED}`;
      let size = a.letterH / 0.72 / TEXEL;
      g.font = font(size);
      const wide = g.measureText(text).width;
      const max = (2.2 * a.letterH) / TEXEL;
      if (wide > max) {
        size *= max / wide;
        g.font = font(size);
      }
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      g.fillText(text, px(a.letters[0]), py(a.letters[1]) + size * 0.36);
    }
    if (mouth) {
      const rad = 0.2 / TEXEL;
      g.lineWidth = 0.06 / TEXEL;
      g.lineCap = 'round';
      g.beginPath();
      if (r.face === 'smile') g.arc(px(a.mouth[0]), py(a.mouth[1] + 0.1), rad, 0.2 * Math.PI, 0.8 * Math.PI);
      else g.arc(px(a.mouth[0]), py(a.mouth[1] - 0.2), rad, 1.2 * Math.PI, 1.8 * Math.PI);
      g.stroke();
    }
    const img = g.getImageData(0, 0, FIELD_N, FIELD_N).data;
    const mask = new Uint8Array(FIELD_N * FIELD_N);
    // the field's rows run upwards, the canvas' downwards
    for (let j = 0; j < FIELD_N; j++)
      for (let i = 0; i < FIELD_N; i++) mask[j * FIELD_N + i] = img[((FIELD_N - 1 - j) * FIELD_N + i) * 4]! > 127 ? 1 : 0;
    const dist = distanceTransform(mask, FIELD_N);
    for (let i = 0; i < dist.length; i++) dist[i] = dist[i]! * TEXEL - 0.02;
    for (const c of b.cookies) c.field.setDeco(dist);
  }

  frame(dt: number, b: Bakery, level: number): void {
    const gl = this.gl;
    if (!gl || this.lost || !this.scene || !this.crumb || !this.blit) return;

    // too slow for this many pixels: take the next smaller target
    const now = performance.now();
    if (dt > 0 && this.lastNow) {
      const ms = now - this.lastNow;
      if (ms < 500) this.times.push(ms);
      if (this.times.length >= 30) {
        const mean = this.times.reduce((s, v) => s + v, 0) / this.times.length;
        this.times = [];
        if (mean > 58 && this.budget < BUDGETS.length - 1) this.budget++;
      }
    }
    this.lastNow = now;

    this.time += dt;
    const [el, dist] = this.aim(b);
    const f = 1 - Math.exp(-2.5 * dt);
    this.greetPx += (this.reserveGreet - this.greetPx) * f;
    this.el += (el - this.el) * f;
    this.dist += (dist - this.dist) * f;
    const cam = (this.cam = this.camera());

    if (this.decoBatch !== b.batch || this.decoRecipe !== b.recipe) this.pipeDeco(b);
    const tgt = this.fitTarget(); // before the atlas is bound: a new target binds its own texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    b.cookies.forEach((c, i) => {
      if (i > 2 || (this.uploaded[i] === c.field && this.versions[i] === c.field.version)) return;
      gl.texSubImage2D(gl.TEXTURE_2D, 0, i * FIELD_N, 0, FIELD_N, FIELD_N, gl.RGBA, gl.FLOAT, c.field.data);
      this.uploaded[i] = c.field;
      this.versions[i] = c.field.version;
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, tgt.fbo);
    gl.viewport(0, 0, tgt.w, tgt.h);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.ALWAYS);
    gl.depthMask(true);
    gl.useProgram(this.scene);
    this.sceneUniforms(gl, b, cam, tgt, level);
    gl.bindVertexArray(this.fullVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    this.drawCrumbs(gl, b, cam);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.cv.width, this.cv.height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(this.blit);
    gl.bindTexture(gl.TEXTURE_2D, tgt.tex);
    gl.uniform1i(this.blitU.uTex!, 0);
    gl.uniform2f(this.blitU.uRes!, this.cv.width, this.cv.height);
    gl.bindVertexArray(this.fullVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  private sceneUniforms(gl: GL, b: Bakery, cam: Cam, tgt: Target, level: number): void {
    const u = this.sceneU;
    const f1 = (n: string, v: number) => gl.uniform1f(u[n] ?? null, v);
    const i1 = (n: string, v: number) => gl.uniform1i(u[n] ?? null, v);
    const f2 = (n: string, x: number, y: number) => gl.uniform2f(u[n] ?? null, x, y);
    const f3 = (n: string, v: readonly number[]) => gl.uniform3f(u[n] ?? null, v[0]!, v[1]!, v[2]!);
    const r = b.recipe;
    const L = b.look;

    f2('uRes', tgt.w, tgt.h);
    f3('uCamPos', cam.pos);
    f3('uCamRight', cam.right);
    f3('uCamUp', cam.up);
    f3('uCamFwd', cam.fwd);
    f1('uTanFov', TAN);
    f1('uShift', cam.shift);
    gl.uniformMatrix4fv(u.uViewProj ?? null, false, cam.viewProj);
    f1('uTime', this.time);
    f1('uGentle', this.gentle ? 1 : 0);
    f1('uSpot', b.sheetR + 1);

    // dough, pin, cutters
    const pinY = 2 * L.tAfter + 0.28 + (1 - L.pin) * 6;
    f1('uLift', Math.max(0, L.ballY - L.doughT));
    f1('uDoughR', L.doughR);
    f1('uRAfter', L.rAfter);
    // the dough rises from the pressed thickness under the pin to the full one ahead of it; a big step needs room
    f1('uPinW', 0.3 + 1.2 * Math.max(0, L.tBefore - L.tAfter));
    f1('uSquash', L.squash);
    f1('uPinX', L.pinX);
    f1('uPinDir', L.pinDir);
    f1('uPin', L.pin);
    f1('uPinY', pinY);
    f1('uPinLen', b.sheetR + 0.3);
    f1('uTBefore', L.tBefore);
    f1('uTAfter', L.tAfter);
    f1('uFlour', L.flour);
    f1('uDoughOn', L.gap < 3.9 && L.erode < 1.99 ? 1 : 0);
    // the bakery lifts the cutters to CUTTER_UP; a far camera (portrait, three cookies) needs them higher to be out of sight
    const cutterY = L.cutterY * Math.max(1, (cam.pos[1] + 0.5) / CUTTER_UP);
    f1('uCutterY', cutterY);
    f1('uCutter', L.cutter);
    f1('uGap', L.gap);
    f1('uEdge', L.edge);
    f1('uChipT', L.chipT);
    f1('uHeat', L.heat);
    f1('uBaked', L.baked);
    f1('uPuff', L.puff);
    f1('uCoatReveal', L.coat);
    f1('uPattern', L.pattern);
    f1('uTopT', L.topT);
    f1('uLevel', sat(level));
    f1('uDeco', L.deco);
    f1('uErode', L.erode);
    const dropping = (L.chipT >= 0 && L.chipT < 1.2) || (L.topT >= 0 && L.topT < 1.6);
    const dropH = dropping ? 0.55 * r.size : 0;
    f1('uDropH', dropH);

    // nothing is higher than this: the march starts there
    let top = L.ballY + L.doughT * 1.2 + 0.05;
    if (L.pin > 0) top = Math.max(top, pinY + 0.3);
    if (L.cutter > 0) top = Math.max(top, cutterY + 0.5);
    if (L.gap > 0) top = Math.max(top, b.top + 0.32 + dropH);
    f1('uTopY', top);

    // the cookies
    const a = anchors(r.shape, r.variant, r.face !== 'none');
    const ck = new Float32Array(12);
    const rot = new Float32Array(6);
    const fix = new Float32Array(48);
    const pop = (t: number) => {
      const s = sat(t);
      return s * (1 + 0.35 * Math.sin(s * Math.PI) * (1 - s));
    };
    b.cookies.slice(0, 3).forEach((c, i) => {
      ck.set([c.x, c.z, c.gone ? 1 : 0, (c.seed % 997) * 0.37], i * 4);
      rot.set([Math.cos(c.rot), Math.sin(c.rot)], i * 2);
      const put = (slot: number, x: number, y: number, kind: number, scale: number) =>
        fix.set([x, y, kind, c.field.d(x, y) < -0.03 ? scale : 0], (i * 4 + slot) * 4);
      if (r.face !== 'none') a.eyes.forEach(([x, y], k) => put(k, x, y, 1, pop(L.deco * 2.2 - k * 0.25)));
      if (r.extra) put(2, a.letters[0], a.letters[1], r.extra === 'cherry' ? 2 : 3, pop(L.deco * 2 - 0.9));
    });
    gl.uniform4fv(u.uCookie ?? null, ck);
    gl.uniform2fv(u.uRot ?? null, rot);
    gl.uniform4fv(u.uFix ?? null, fix);
    i1('uCount', Math.min(3, b.cookies.length));
    f1('uSize', r.size);
    f1('uThick', r.thickness);
    f1('uRise', r.rise);
    f1('uEyeR', a.eyeR);

    const shape = r.coat === 'none' ? [0, 0.05] : COAT_SHAPE[r.flow];
    const margin = shape[1]!;
    f2('uCoat', COAT_KIND[r.coat], FLOW_KIND[r.flow]);
    f2('uCoatP', shape[0]! * (r.coat === 'glaze' ? 0.5 : 1), margin);
    const dip = -0.6 + (r.seed % 7) * 0.2;
    f3('uHalf', [Math.cos(dip), Math.sin(dip), r.pattern === 'half' && r.coat !== 'none' ? 1 : 0]);
    const d = DOUGH[r.dough];
    f3('uColor', lin(r.color));
    f3('uAccent', lin(r.accent));
    f3('uRaw', lin(d.raw));
    f3('uBakedCol', lin(d.baked));
    f3('uInside', lin([0, 1, 2].map((k) => Math.min(1, mix(d.raw[k]!, d.baked[k]!, 0.35) * 1.1)) as RGB));
    i1('uDoughKind', DOUGHS.indexOf(r.dough));
    f1('uChips', r.chips > 0 ? 0.1 + (0.85 * r.chips) / 16 : 0);
    const topping = (t: Recipe['toppings'][number] | undefined): number[] =>
      t
        ? [TOP_KIND[t.kind], t.kind === 'pearls' ? 0.2 : mix(0.34, 0.2, t.amount), t.kind === 'pearls' ? 0.85 : 0.55 + 0.4 * t.amount]
        : [0, 1, 0];
    f3('uTopA', topping(r.toppings[0]));
    f3('uTopB', topping(r.toppings[1]));
    f1('uGlitter', r.glitter);
    i1('uPatternKind', PATTERN_KIND[r.pattern]);
    f1('uBorder', r.border ? 1 : 0);
    f1('uBorderIn', margin / r.size + 0.07);
    const piped = PATTERN_KIND[r.pattern] > 0 || r.border || r.letters.length > 0 || r.face === 'smile' || r.face === 'frown';
    f1('uPipeOn', piped ? 1 : 0);
    i1('uField', 0);
  }

  /** blob shadows on the tray first, then the crumbs themselves, both against the scene's depth */
  private drawCrumbs(gl: GL, b: Bakery, cam: Cam): void {
    const n = b.crumbs.length;
    if (!n) return;
    if (this.crumbData.length < n * 8) this.crumbData = new Float32Array(Math.max(n, 64) * 8);
    const data = this.crumbData;
    b.crumbs.forEach((c, i) => {
      const col = lin(c.color);
      data.set([c.x, c.y, c.z, c.r * sat(c.life), col[0], col[1], col[2], c.seed % 100], i * 8);
    });
    const u = this.crumbU;
    gl.useProgram(this.crumb);
    gl.bindVertexArray(this.crumbVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.crumbBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, n * 8), gl.DYNAMIC_DRAW);
    gl.uniformMatrix4fv(u.uViewProj ?? null, false, cam.viewProj);
    gl.uniform3f(u.uCamRight ?? null, cam.right[0], cam.right[1], cam.right[2]);
    gl.uniform3f(u.uCamUp ?? null, cam.up[0], cam.up[1], cam.up[2]);
    gl.uniform3f(u.uCamFwd ?? null, cam.fwd[0], cam.fwd[1], cam.fwd[2]);
    gl.uniform1f(u.uHeat ?? null, b.look.heat);
    gl.depthFunc(gl.LEQUAL);

    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.DST_COLOR, gl.ZERO);
    gl.uniform1f(u.uShadow ?? null, 1);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);

    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.uniform1f(u.uShadow ?? null, 0);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
  }
}
