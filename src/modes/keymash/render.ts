// KEYMASH renderer: canvas 2D, persistent "paint" layer with trails + feedback,
// sprites/particles on top, view transforms and glitch post-processing.

import type { Color, Point, VMEvent, EventOf, ParticleSpec, ShapeKind, TextStyle, ActorKind } from '../../lang/types';

type Ctx = CanvasRenderingContext2D;
type PartKind = ParticleSpec['kind'] | 'star' | 'rect' | 'char' | 'bubble';

interface Stroke {
  pts: Point[];
  w: number;
  color: Color;
  dur: number;
  delay: number;
  t: number;
  idx: number;
  paw?: boolean;
  done?: boolean;
}
interface ShapeSprite {
  kind: 'shape';
  shape: ShapeKind;
  x: number;
  y: number;
  r: number;
  rot: number;
  color: Color;
  fill: boolean;
  w: number;
  grow: number;
  n?: number;
  age: number;
  life: number;
}
interface EmojiSprite {
  kind: 'emoji';
  ch: string;
  x: number;
  y: number;
  size: number;
  rot: number;
  age: number;
  life: number;
}
interface TextSprite {
  kind: 'text';
  s: string;
  x: number;
  y: number;
  size: number;
  style: TextStyle;
  color: Color;
  vy: number;
  age: number;
  life: number;
  tw?: number;
}
interface MathSprite {
  kind: 'math';
  s: string;
  x: number;
  y: number;
  color: Color;
  big?: boolean;
  age: number;
  life: number;
  w?: number;
}
type Sprite = ShapeSprite | EmojiSprite | TextSprite | MathSprite;
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  c: Color;
  kind: PartKind;
  g: number;
  drag: number;
  rot: number;
  vr: number;
  ch?: string;
  sway?: number;
}
interface Actor {
  kind: ActorKind;
  ch: string;
  x: number;
  y: number;
  size: number;
  color: Color;
  age: number;
  life: number;
  dir: number;
  vx: number;
  vy: number;
  y0: number;
  ty: number;
  step: number;
}
interface Banner {
  text: string;
  progress?: boolean;
  age: number;
  life: number;
}
interface Flash {
  c: Color;
  a: number;
  t: number;
}
interface View {
  turn: number;
  spin: number;
  zoom: number;
  zoomT: number;
  kick: number;
  shake: number;
  flip: number;
  flipT: number;
  wobble: number;
}

const TAU = Math.PI * 2;
/** All rotation requests are softened to this fraction. */
const ROT_SCALE = 0.45;
const hsl = (c: Color, a = 1): string => `hsla(${c.h | 0},${c.s | 0}%,${c.l | 0}%,${a})`;
const rand = (a: number, b: number): number => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const easeOutBack = (t: number): number => {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const SCRAMBLE = '01#$%&@<>/\\|{}[]*+=?!ABCDEFXYZ';

function ctx2d(c: HTMLCanvasElement): Ctx {
  const x = c.getContext('2d');
  if (!x) throw new Error('canvas 2d not available');
  return x;
}

export class Renderer {
  cv: HTMLCanvasElement;
  ctx: Ctx;
  paint: HTMLCanvasElement;
  pctx: Ctx;
  tmp: HTMLCanvasElement;
  tctx: Ctx;
  glyphs = new Map<string, HTMLCanvasElement>();
  time = 0;
  font = '"Share Tech Mono", ui-monospace, monospace';
  // size: canvas pixels, world scale (px per world unit), world half-extent
  W = 0;
  H = 0;
  dpr = 1;
  s = 1;
  hw = 500;
  hh = 500;
  strokes: Stroke[] = [];
  sprites: Sprite[] = [];
  parts: Particle[] = [];
  actors: Actor[] = [];
  banner: Banner | null = null;
  flashes: Flash[] = [];
  view!: View;
  fb = { amt: 0, zoom: 1, rot: 0, until: 0 };
  mirror = false;
  kaleido = 0;
  glitchAmt = 0;
  glitchUntil = 0;
  invertUntil = 0;
  sirenUntil = 0;
  bg = { h: 150, l: 4, hT: 150, lT: 4 };
  fade = 0.07;
  fadeT = 0.07;
  copyK = 1;
  heads: { x: number; y: number; c: Color }[] = [];
  /** CSS pixels at the bottom of the stage covered by the log and buttons (set by the player). */
  reserveBottom = 0;
  /** "Reduce motion" in the system settings: softer flashes, shakes and glitches, no strobing. */
  gentle = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(canvas: HTMLCanvasElement) {
    this.cv = canvas;
    this.ctx = ctx2d(canvas);
    this.paint = document.createElement('canvas');
    this.pctx = ctx2d(this.paint);
    this.tmp = document.createElement('canvas');
    this.tctx = ctx2d(this.tmp);
    this.reset();
  }

  reset(): void {
    this.strokes = [];
    this.sprites = [];
    this.parts = [];
    this.actors = [];
    this.banner = null;
    this.flashes = [];
    this.view = { turn: 0, spin: 0, zoom: 1, zoomT: 1, kick: 0, shake: 0, flip: 1, flipT: 1, wobble: 0 };
    this.fb = { amt: 0, zoom: 1, rot: 0, until: 0 };
    this.mirror = false;
    this.kaleido = 0;
    this.glitchAmt = 0;
    this.glitchUntil = 0;
    this.invertUntil = 0;
    this.sirenUntil = 0;
    this.bg = { h: 150, l: 4, hT: 150, lT: 4 };
    this.fade = 0.07;
    this.fadeT = 0.07;
    if (this.W) {
      this.pctx.setTransform(1, 0, 0, 1, 0, 0);
      this.pctx.clearRect(0, 0, this.W, this.H);
    }
  }

  resize(cssW: number, cssH: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const W = Math.max(2, Math.round(cssW * dpr)),
      H = Math.max(2, Math.round(cssH * dpr));
    if (W === this.W && H === this.H && this.cv.width === W && this.cv.height === H) return; // (the canvas is shared with PETRI)
    // keep the old paint when resizing
    const keep = this.W
      ? (() => {
          this.tmp.width = this.W;
          this.tmp.height = this.H;
          this.tctx.drawImage(this.paint, 0, 0);
          return true;
        })()
      : false;
    this.cv.width = W;
    this.cv.height = H;
    this.cv.style.width = cssW + 'px';
    this.cv.style.height = cssH + 'px';
    this.paint.width = W;
    this.paint.height = H;
    if (keep) this.pctx.drawImage(this.tmp, 0, 0, W, H);
    this.tmp.width = W;
    this.tmp.height = H;
    this.W = W;
    this.H = H;
    this.dpr = dpr;
    this.s = Math.min(W, H) / 1000;
    this.hw = W / 2 / this.s;
    this.hh = H / 2 / this.s;
  }

  // ---------- glyph cache (emoji are slow to draw) ----------
  glyph(ch: string, px: number, color?: string): HTMLCanvasElement {
    const b = px <= 24 ? 24 : px <= 48 ? 48 : px <= 96 ? 96 : 160;
    const key = ch + '|' + b + '|' + (color || '');
    let g = this.glyphs.get(key);
    if (!g) {
      if (this.glyphs.size > 300) this.glyphs.clear();
      g = document.createElement('canvas');
      g.width = g.height = Math.ceil(b * 1.3);
      const c = ctx2d(g);
      c.font = color ? `${b}px ${this.font}` : `${b}px ${EMOJI_FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      if (color) {
        c.fillStyle = color;
        c.shadowColor = color;
        c.shadowBlur = b * 0.25;
      }
      c.fillText(ch, g.width / 2, g.height / 2 + b * 0.06);
      this.glyphs.set(key, g);
    }
    return g;
  }
  drawGlyph(c: Ctx, ch: string, x: number, y: number, px: number, rot = 0, alpha = 1, flipX = false, color?: string): void {
    const g = this.glyph(ch, px, color);
    const sz = px * 1.3;
    c.save();
    c.globalAlpha = alpha;
    c.translate(x, y);
    if (rot) c.rotate(rot);
    if (flipX) c.scale(-1, 1);
    c.drawImage(g, -sz / 2, -sz / 2, sz, sz);
    c.restore();
  }

  // symmetry helper: draws fn under mirror/kaleidoscope transforms (world coords, origin centre)
  sym(c: Ctx, fn: (c: Ctx) => void): void {
    const n = this.kaleido || 1;
    for (let i = 0; i < n; i++) {
      c.save();
      if (i) c.rotate((i * TAU) / n);
      fn(c);
      c.restore();
      if (this.mirror) {
        c.save();
        if (i) c.rotate((i * TAU) / n);
        c.scale(-1, 1);
        fn(c);
        c.restore();
      }
    }
  }

  // ---------- events ----------
  handle(e: VMEvent): void {
    const v = this.view;
    switch (e.type) {
      case 'stroke':
        if (this.strokes.length > 400) this.strokes.shift();
        this.strokes.push({
          pts: e.pts,
          w: e.w || 2,
          color: e.color,
          dur: Math.max(0.02, e.dur || 0.3),
          delay: e.delay || 0,
          t: 0,
          idx: 0,
          paw: e.paw,
        });
        break;
      case 'shape':
        this.addSprite({ ...e, kind: 'shape', shape: e.kind, age: 0, life: e.life || 1.2 });
        break;
      case 'particles':
        this.spawn(e);
        break;
      case 'text':
        this.addSprite({
          ...e,
          kind: 'text',
          age: 0,
          life: e.style === 'big' ? 1.6 : e.style === 'sub' ? 3 : 1.8,
          vy: e.style === 'sub' ? 0 : -40,
        });
        break;
      case 'math': {
        // at most 6 results on screen: older ones fade out quickly, so the newest always get a clear row
        const ms = this.sprites.filter((x): x is MathSprite => x.kind === 'math' && x.life - x.age > 0.15);
        for (const old of ms.slice(0, Math.max(0, ms.length - 5))) old.life = old.age + 0.15;
        const size = e.big ? 44 : 36;
        this.ctx.font = `${size}px ${this.font}`;
        const w = this.ctx.measureText(e.s).width;
        const [x, y] = this.mathSlot(e.x, e.y, w + 32, size * 1.5);
        this.addSprite({ ...e, kind: 'math', x, y, w, age: 0, life: 3.2 });
        break;
      }
      case 'emoji':
        this.addSprite({ ...e, kind: 'emoji', age: 0, rot: rand(-0.3, 0.3) });
        break;
      case 'actor':
        this.addActor(e);
        break;
      case 'glitch':
        this.glitchAmt = Math.max(this.glitchAmt, (e.amt || 0.4) * (this.gentle ? 0.35 : 1));
        this.glitchUntil = Math.max(this.glitchUntil, this.time + (e.dur || 0.3));
        break;
      case 'view':
        if (e.zoom) v.kick += e.zoom;
        if (e.zoomTo) v.zoomT = clamp(e.zoomTo, 0.3, 3);
        if (e.shake) v.shake = Math.min(60, v.shake + e.shake * (this.gentle ? 0.25 : 1));
        // rotation only turns what is already painted; new drawing stays upright (see frame())
        if (e.rot) v.turn = clamp(v.turn + (e.rot * ROT_SCALE * Math.PI) / 180, -0.6, 0.6);
        if (e.spin) v.spin = clamp(v.spin + (e.spin * ROT_SCALE * Math.PI) / 180, -1.2, 1.2);
        if (e.wobble) v.wobble = Math.min(3, v.wobble + e.wobble);
        if (e.flip) v.flipT *= -1;
        break;
      case 'feedback':
        this.fb = { amt: e.amt, zoom: e.zoom, rot: (e.rot * Math.PI) / 180, until: this.time + e.dur };
        break;
      case 'mode':
        if (e.mirror === 'toggle') this.mirror = !this.mirror;
        if (e.kaleido === 'toggle') this.kaleido = this.kaleido ? 0 : 3 + Math.floor(Math.random() * 5);
        break;
      case 'flash':
        this.flashes.push({ c: e.color, a: (e.a || 0.2) * (this.gentle ? 0.25 : 1), t: 0 });
        break;
      case 'bg':
        if (e.h !== undefined) this.bg.hT = e.h;
        if (e.l !== undefined) this.bg.lT = e.l;
        break;
      case 'invert':
        if (!this.gentle) this.invertUntil = this.time + (e.dur || 0.5);
        break;
      case 'siren':
        if (!this.gentle) this.sirenUntil = this.time + (e.dur || 1.5);
        break;
      case 'trails':
        this.fadeT = e.v;
        this.fade = e.v;
        break;
      case 'calm':
        v.turn = 0;
        v.spin = 0;
        v.zoomT = 1;
        v.flipT = 1;
        v.wobble = 0;
        this.mirror = false;
        this.kaleido = 0;
        this.fb.until = 0;
        this.bg.hT = 150;
        this.bg.lT = 4;
        break;
      case 'rainbow': {
        for (let i = 0; i < 7; i++) {
          const R = 300 - i * 18;
          const pts: Point[] = [];
          for (let k = 0; k <= 50; k++) {
            const a = Math.PI + (k / 50) * Math.PI;
            pts.push([Math.cos(a) * R, this.hh * 0.6 + Math.sin(a) * R]);
          }
          this.strokes.push({ pts, w: 9, color: { h: i * 45, s: 95, l: 58 }, dur: 0.8, delay: i * 0.05, t: 0, idx: 0 });
        }
        break;
      }
      case 'banner':
        this.banner = { text: e.text, progress: e.progress, age: 0, life: 2.4 };
        break;
    }
  }

  /**
   * Pick a spot for a math label: free of other labels, near where it was asked for, and away from
   * the labels already on screen, so results spread over the stage instead of stacking up.
   */
  mathSlot(x: number, y: number, w: number, h: number): Point {
    const maxW = this.hw * 1.7;
    const sc = Math.min(1, maxW / w);
    w *= sc;
    h *= sc;
    const live = this.sprites.filter((m): m is MathSprite => m.kind === 'math' && m.life - m.age > 0.15);
    const boxes = live.map((m) => {
      const mw = Math.min(maxW, (m.w ?? 200) + 32),
        mh = (m.big ? 44 : 36) * 1.5 * Math.min(1, maxW / ((m.w ?? 200) + 32));
      return { x: m.x, y: m.y, w: mw, h: mh };
    });
    const pad = 14;
    const fits = (cx: number, cy: number) =>
      boxes.every((b) => Math.abs(b.x - cx) * 2 >= b.w + w + pad || Math.abs(b.y - cy) * 2 >= b.h + h + pad);
    // margins leave room for the zoom kicks of drums, so labels never touch the edge
    const ex = this.hw * 0.86,
      x0 = -ex + w / 2,
      x1 = ex - w / 2;
    const bottom = this.hh - (this.reserveBottom * this.dpr) / this.s; // keep clear of the log and buttons
    const y0 = -this.hh * 0.8 + h / 2,
      y1 = Math.max(y0, bottom - h / 2 - 10);
    let best: Point = [clamp(x, Math.min(x0, x1), Math.max(x0, x1)), clamp(y, y0, y1)];
    let bestScore = Infinity;
    const cols = x1 > x0 ? 7 : 1,
      rows = 12;
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < cols; j++) {
        const cx = cols === 1 ? 0 : x0 + ((x1 - x0) * j) / (cols - 1);
        const cy = y0 + ((y1 - y0) * i) / (rows - 1);
        if (!fits(cx, cy)) continue;
        const near = Math.hypot(cx - x, cy - y);
        const crowd = boxes.reduce((m, b) => Math.min(m, Math.hypot(b.x - cx, b.y - cy)), Infinity);
        const score = near * 0.6 - Math.min(crowd, this.hw) * 0.8 + Math.random() * 60;
        if (score < bestScore) {
          bestScore = score;
          best = [cx, cy];
        }
      }
    return best;
  }

  addSprite(s: Sprite): void {
    if (this.sprites.length > 260) this.sprites.shift();
    this.sprites.push(s);
  }

  addActor(e: EventOf<'actor'>): void {
    const a: Actor = {
      kind: e.kind,
      ch: e.ch ?? '',
      x: e.x,
      y: e.y,
      size: e.size || 70,
      color: e.color ?? { h: 0, s: 0, l: 100 },
      age: -(e.delay || 0),
      life: 3,
      dir: 1,
      vx: 0,
      vy: 0,
      y0: e.y,
      ty: 0,
      step: -1,
    };
    const W = this.hw,
      H = this.hh;
    switch (e.kind) {
      case 'run':
      case 'drive': {
        const dir = Math.random() < 0.5 ? 1 : -1;
        a.dir = dir;
        a.x = -dir * (W + 80);
        a.y = clamp(e.y, -H * 0.7, H * 0.7);
        if (e.kind === 'drive') {
          a.y = H * 0.75;
          a.life = 2;
        }
        a.vx = (dir * (2 * W + 160)) / a.life;
        break;
      }
      case 'fly':
      case 'swim': {
        const dir = Math.random() < 0.5 ? 1 : -1;
        a.dir = dir;
        a.x = -dir * (W + 80);
        a.y0 = clamp(e.y, -H * 0.7, H * 0.7);
        a.life = e.kind === 'swim' ? 4 : 3;
        a.vx = (dir * (2 * W + 160)) / a.life;
        break;
      }
      case 'ufo':
        a.x = -W - 80;
        a.y = -H * 0.6;
        a.life = 3.5;
        a.vx = (2 * W + 160) / a.life;
        a.dir = 1;
        break;
      case 'stomp':
        a.life = 3;
        a.dir = Math.random() < 0.5 ? 1 : -1;
        a.vx = a.dir * 140;
        break;
      case 'rocket':
        a.x = clamp(e.x, -W * 0.8, W * 0.8);
        a.y = H + 60;
        a.vy = -(2 * H + 200) / 1.8;
        a.life = 1.8;
        break;
      case 'ball':
        a.vx = rand(-500, 500);
        a.vy = rand(-900, -500);
        a.life = 5;
        a.size = 60;
        break;
      case 'firework':
        a.y = H;
        a.ty = rand(-H * 0.7, -H * 0.1);
        a.life = 1;
        break;
      case 'float':
        a.life = 2.6;
        break;
      default:
        a.life = 2.2;
    }
    if (this.actors.length > 30) this.actors.shift();
    this.actors.push(a);
  }

  spawn(e: ParticleSpec): void {
    const n = Math.min(e.n || 10, 300);
    const c = e.color || { h: 120, s: 90, l: 60 };
    const W = this.hw,
      H = this.hh;
    const ech = e.ch;
    const chars = ech ? Array.from(ech) : null;
    const emojis =
      ech && /\p{Extended_Pictographic}/u.test(ech)
        ? (() => {
            try {
              return Array.from(new Intl.Segmenter().segment(ech), (x) => x.segment);
            } catch (er) {
              return [ech];
            }
          })()
        : null;
    for (let i = 0; i < n; i++) {
      const p: Particle = { x: e.x, y: e.y, vx: 0, vy: 0, age: 0, life: 1, size: 4, c, kind: e.kind, g: 0, drag: 0.98, rot: 0, vr: 0 };
      const a = Math.random() * TAU;
      const sp = rand(80, 420) * (e.spread || 1);
      switch (e.kind) {
        case 'burst':
          p.vx = Math.cos(a) * sp;
          p.vy = Math.sin(a) * sp;
          p.life = rand(0.5, 1.2);
          p.size = rand(2, 6);
          p.drag = 0.93;
          p.c = { h: c.h + rand(-30, 30), s: c.s, l: c.l + 10 };
          break;
        case 'dots':
        case 'stream':
          p.vx = Math.cos(a) * sp * 0.4;
          p.vy = Math.sin(a) * sp * 0.4;
          p.life = rand(0.3, 0.8);
          p.size = rand(1.5, 4);
          p.drag = 0.9;
          break;
        case 'stars':
        case 'sparkle':
          p.vx = Math.cos(a) * sp * 0.6;
          p.vy = Math.sin(a) * sp * 0.6;
          p.life = rand(0.8, 1.8);
          p.size = rand(5, 14);
          p.kind = 'star';
          p.drag = 0.95;
          p.c = { h: e.kind === 'sparkle' ? rand(40, 60) : c.h + rand(-40, 40), s: 90, l: 75 };
          break;
        case 'confetti':
          p.vx = Math.cos(a) * sp;
          p.vy = Math.sin(a) * sp - 300;
          p.g = 600;
          p.life = rand(1.5, 2.5);
          p.size = rand(6, 12);
          p.kind = 'rect';
          p.vr = rand(-10, 10);
          p.c = { h: rand(0, 360), s: 95, l: 60 };
          p.drag = 0.97;
          break;
        case 'chars':
          p.vx = Math.cos(a) * sp * 0.4;
          p.vy = -rand(100, 300);
          p.life = rand(0.8, 1.5);
          p.size = rand(18, 30);
          p.kind = 'char';
          p.ch = chars ? chars[i % chars.length] : '*';
          break;
        case 'emoji':
        case 'paws':
          p.vx = Math.cos(a) * sp * 0.8;
          p.vy = Math.sin(a) * sp * 0.8 - 150;
          p.g = 400;
          p.life = rand(1.2, 2.2);
          p.size = rand(26, 48);
          p.kind = 'emoji';
          p.ch = emojis ? emojis[i % emojis.length] : e.ch || '✨';
          p.vr = rand(-4, 4);
          p.drag = 0.97;
          if (e.kind === 'paws') {
            p.x = e.x + (i - n / 2) * 40;
            p.y = e.y + (i % 2 ? 14 : -14);
            p.vx = p.vy = p.g = 0;
            p.life = 1.5 + i * 0.08;
            p.vr = 0;
            p.rot = Math.PI / 2;
            p.size = 34;
          }
          break;
        case 'fire':
          p.x += rand(-60, 60);
          p.y += rand(-10, 30);
          p.vx = rand(-40, 40);
          p.vy = -rand(150, 420);
          p.life = rand(0.5, 1.2);
          p.size = rand(8, 22);
          p.kind = 'fire';
          p.drag = 0.97;
          break;
        case 'rain':
          p.x = rand(-W, W);
          p.y = -H - rand(0, H);
          p.vx = -60;
          p.vy = rand(900, 1300);
          p.life = 2;
          p.kind = 'rain';
          p.size = rand(14, 30);
          p.drag = 1;
          break;
        case 'snow':
          p.x = rand(-W, W);
          p.y = -H - rand(0, H * 0.6);
          p.vx = rand(-30, 30);
          p.vy = rand(60, 150);
          p.life = rand(4, 7);
          p.kind = 'char';
          p.ch = '❄';
          p.size = rand(14, 28);
          p.c = { h: 200, s: 60, l: 92 };
          p.drag = 1;
          p.sway = rand(0.5, 2);
          break;
        case 'smoke':
          p.x += rand(-20, 20);
          p.vx = rand(-60, 60);
          p.vy = -rand(30, 120);
          p.life = rand(1.5, 3);
          p.size = rand(20, 50);
          p.kind = 'smoke';
          p.c = e.color && e.color.s < 50 ? e.color : { h: 0, s: 0, l: 55 };
          p.drag = 0.98;
          break;
        case 'bubbles':
          p.x += rand(-80, 80);
          p.vx = rand(-20, 20);
          p.vy = -rand(60, 200);
          p.life = rand(2, 3.5);
          p.size = rand(6, 22);
          p.kind = 'bubble';
          p.sway = rand(1, 3);
          p.drag = 1;
          p.c = { h: rand(170, 300), s: 80, l: 75 };
          break;
        case 'money':
          p.x = rand(-W, W);
          p.y = -H - rand(0, H);
          p.vy = rand(150, 400);
          p.vx = rand(-40, 40);
          p.life = 4;
          p.kind = 'emoji';
          p.ch = emojis ? emojis[i % emojis.length] : '💸';
          p.size = rand(24, 40);
          p.vr = rand(-3, 3);
          p.drag = 1;
          break;
        case 'matrix':
          p.x = Math.round(rand(-W, W) / 24) * 24;
          p.y = -H - rand(0, H * 1.5);
          p.vy = rand(300, 700);
          p.life = 3;
          p.kind = 'matrix';
          p.ch = SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0];
          p.size = rand(16, 26);
          p.drag = 1;
          break;
        case 'warp':
          p.x = 0;
          p.y = 0;
          p.vx = Math.cos(a) * rand(100, 300);
          p.vy = Math.sin(a) * rand(100, 300);
          p.life = 1.6;
          p.kind = 'warp';
          p.drag = 1.06;
          p.size = 2;
          p.c = { h: rand(180, 280), s: 80, l: 80 };
          break;
        default:
          p.vx = Math.cos(a) * sp;
          p.vy = Math.sin(a) * sp;
          p.life = 0.8;
      }
      this.parts.push(p);
    }
    if (this.parts.length > 1000) this.parts.splice(0, this.parts.length - 1000);
  }

  // ---------- per frame ----------
  frame(dt: number, level = 0, bass = 0): void {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    const { W, H, s } = this;
    if (!W) return;
    const v = this.view;
    const T = this.time;

    // view dynamics
    // how far to turn the painted layer this frame: ease out the pending turn, plus decaying spin
    const ease = v.turn * Math.min(1, dt * 3);
    v.turn -= ease;
    const paintTurn = ease + v.spin * dt;
    v.spin *= Math.pow(0.25, dt);
    v.zoom += (v.zoomT - v.zoom) * Math.min(1, dt * 3);
    v.zoomT += (1 - v.zoomT) * dt * 0.08;
    v.kick *= Math.pow(0.002, dt);
    v.shake *= Math.pow(0.004, dt);
    v.flip += (v.flipT - v.flip) * Math.min(1, dt * 6);
    v.wobble *= Math.pow(0.4, dt);
    this.bg.h += (((((this.bg.hT - this.bg.h) % 360) + 540) % 360) - 180) * dt * 1.5;
    this.bg.l += (this.bg.lT - this.bg.l) * dt * 2;
    this.bg.hT += (150 - this.bg.hT) * dt * 0.05;
    this.bg.lT += (4 - this.bg.lT) * dt * 0.1;
    this.fade += (this.fadeT - this.fade) * dt;
    this.fadeT += (0.07 - this.fadeT) * dt * 0.1;

    // ---- paint layer ----
    const pc = this.pctx;
    pc.setTransform(1, 0, 0, 1, 0, 0);
    pc.globalCompositeOperation = 'destination-out';
    const copies = (this.kaleido || 1) * (this.mirror ? 2 : 1);
    this.copyK = 1 / Math.sqrt(copies);
    const fade = this.fade * (1 + 0.2 * (copies - 1)) * (this.fb.until > T ? 1.6 : 1);
    pc.globalAlpha = 1;
    pc.fillStyle = `rgba(0,0,0,${clamp(fade * dt * 60, 0.005, 0.5)})`;
    pc.fillRect(0, 0, W, H);
    pc.globalCompositeOperation = 'source-over';

    if (Math.abs(paintTurn) > 1e-4) {
      // lossy by design: the paint is resampled into a turned copy of itself
      this.tctx.setTransform(1, 0, 0, 1, 0, 0);
      this.tctx.clearRect(0, 0, W, H);
      this.tctx.drawImage(this.paint, 0, 0);
      pc.save();
      pc.clearRect(0, 0, W, H);
      pc.translate(W / 2, H / 2);
      pc.rotate(paintTurn);
      pc.translate(-W / 2, -H / 2);
      pc.drawImage(this.tmp, 0, 0);
      pc.restore();
    }
    if (this.fb.until > T) {
      // lossy feedback: the paint is redrawn onto itself, rotated + scaled -> tunnels, vortices
      const k = Math.min(1, (this.fb.until - T) / 0.5) * this.fb.amt;
      this.tctx.setTransform(1, 0, 0, 1, 0, 0);
      this.tctx.clearRect(0, 0, W, H);
      this.tctx.drawImage(this.paint, 0, 0);
      pc.save();
      pc.globalAlpha = k * 0.7;
      pc.translate(W / 2, H / 2);
      pc.rotate(this.fb.rot * dt * (this.gentle ? 0.3 : 0.6));
      pc.scale(1 + (this.fb.zoom - 1) * dt * 60, 1 + (this.fb.zoom - 1) * dt * 60);
      pc.translate(-W / 2, -H / 2);
      pc.drawImage(this.tmp, 0, 0);
      pc.restore();
    }

    // progressive strokes
    pc.setTransform(s, 0, 0, s, W / 2, H / 2);
    pc.globalCompositeOperation = 'lighter';
    pc.lineCap = 'round';
    pc.lineJoin = 'round';
    this.heads = [];
    for (const st of this.strokes) {
      st.t += dt;
      const prog = clamp((st.t - st.delay) / st.dur, 0, 1);
      const n = st.pts.length;
      const target = Math.floor(prog * (n - 1));
      if (target > st.idx) {
        const seg = st.pts.slice(st.idx, target + 1);
        this.sym(pc, (c) => {
          c.beginPath();
          c.moveTo(seg[0][0], seg[0][1]);
          for (let i = 1; i < seg.length; i++) c.lineTo(seg[i][0], seg[i][1]);
          const k = this.copyK;
          c.strokeStyle = hsl(st.color, (st.paw ? 0.08 : 0.14) * k);
          c.lineWidth = st.w * 4;
          c.stroke();
          c.strokeStyle = hsl(st.color, (st.paw ? 0.5 : 0.9) * k);
          c.lineWidth = st.w;
          c.stroke();
        });
        st.idx = target;
        if (prog < 1) this.heads.push({ x: seg[seg.length - 1][0], y: seg[seg.length - 1][1], c: st.color });
      }
      st.done = prog >= 1;
    }
    this.strokes = this.strokes.filter((x) => !x.done);
    pc.globalCompositeOperation = 'source-over';

    // ---- main canvas ----
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    const bl = Math.min(9, this.bg.l + level * 3);
    c.fillStyle = `hsl(${this.bg.h | 0},70%,${bl.toFixed(1)}%)`;
    c.fillRect(0, 0, W, H);

    const shx = (Math.random() - 0.5) * v.shake * s * 2,
      shy = (Math.random() - 0.5) * v.shake * s * 2;
    const zoom = v.zoom * (1 + v.kick + bass * 0.04);
    const sway = Math.sin(T * 5) * v.wobble * 10 * s; // wobble sways sideways, it never tilts new content
    c.save();
    c.translate(W / 2 + shx + sway, H / 2 + shy);
    c.scale(zoom, zoom * v.flip);

    // cyber grid, pulsing with the audio
    c.save();
    c.scale(s, s);
    c.strokeStyle = `hsla(${(this.bg.h + 20) | 0},100%,60%,${0.05 + level * 0.18})`;
    c.lineWidth = 1 / s;
    const gs = 100,
      off = (T * 20) % gs;
    const ex = this.hw * 2,
      ey = this.hh * 2;
    c.beginPath();
    for (let x = -ex - off; x <= ex; x += gs) {
      c.moveTo(x, -ey);
      c.lineTo(x, ey);
    }
    for (let y = -ey + off; y <= ey; y += gs) {
      c.moveTo(-ex, y);
      c.lineTo(ex, y);
    }
    c.stroke();
    c.restore();

    c.drawImage(this.paint, -W / 2, -H / 2);
    c.scale(s, s);
    c.lineCap = 'round';
    c.lineJoin = 'round';

    // pen heads
    c.globalCompositeOperation = 'lighter';
    for (const h of this.heads) {
      c.fillStyle = hsl({ ...h.c, l: 85 }, 0.9);
      c.beginPath();
      c.arc(h.x, h.y, 5, 0, TAU);
      c.fill();
      c.fillStyle = hsl(h.c, 0.25);
      c.beginPath();
      c.arc(h.x, h.y, 16, 0, TAU);
      c.fill();
    }
    c.globalCompositeOperation = 'source-over';

    this.drawSprites(c, dt);
    this.drawParticles(c, dt);
    this.drawActors(c, dt);
    c.restore();

    // ---- screen-space overlays ----
    c.setTransform(1, 0, 0, 1, 0, 0);
    this.drawBanner(c, dt);
    this.post(c, dt);
  }

  shapePath(c: Ctx, sp: ShapeSprite, r: number): void {
    c.beginPath();
    switch (sp.shape) {
      case 'circle':
      case 'ring':
      case 'dot':
        c.arc(0, 0, r, 0, TAU);
        break;
      case 'square':
        c.rect(-r, -r, 2 * r, 2 * r);
        break;
      case 'tri':
        for (let i = 0; i < 3; i++) {
          const a = (i * TAU) / 3 - Math.PI / 2;
          c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        c.closePath();
        break;
      case 'poly': {
        const n = sp.n || 6;
        for (let i = 0; i < n; i++) {
          const a = (i * TAU) / n;
          c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        c.closePath();
        break;
      }
      case 'star':
        for (let i = 0; i < 10; i++) {
          const a = (i * TAU) / 10 - Math.PI / 2;
          const rr = i % 2 ? r * 0.45 : r;
          c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        c.closePath();
        break;
      case 'heart':
        for (let i = 0; i <= 40; i++) {
          const t = (i / 40) * TAU;
          c.lineTo(
            (r / 17) * 16 * Math.pow(Math.sin(t), 3),
            (-r / 17) * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)),
          );
        }
        c.closePath();
        break;
      case 'flower': {
        const n = sp.n || 6;
        for (let i = 0; i <= 120; i++) {
          const a = (i / 120) * TAU;
          const rr = r * (0.55 + 0.45 * Math.abs(Math.cos((n / 2) * a)));
          c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        c.closePath();
        break;
      }
      case 'sun':
        c.arc(0, 0, r * 0.6, 0, TAU);
        break;
      case 'moon':
        c.arc(0, 0, r, 0.6, TAU - 0.6);
        c.arc(r * 0.45, 0, r * 0.75, TAU - 0.9, 0.9, true);
        c.closePath();
        break;
      case 'cross':
        c.moveTo(-r, -r);
        c.lineTo(r, r);
        c.moveTo(r, -r);
        c.lineTo(-r, r);
        break;
      default:
        c.arc(0, 0, r, 0, TAU);
    }
  }

  drawSprites(c: Ctx, dt: number): void {
    const keep: Sprite[] = [];
    for (const sp of this.sprites) {
      sp.age += dt;
      if (sp.age > sp.life) {
        if (sp.kind === 'shape') this.stampShape(sp);
        continue;
      }
      keep.push(sp);
      const t = sp.age / sp.life;
      const alpha = 1 - t * t;
      switch (sp.kind) {
        case 'shape': {
          const pop = sp.age < 0.25 ? easeOutBack(sp.age / 0.25) : 1;
          const r = sp.r * pop * (1 + (sp.grow || 0) * t);
          this.sym(c, (cc) => {
            cc.save();
            cc.translate(sp.x, sp.y);
            cc.rotate(((sp.rot || 0) * Math.PI) / 180 + sp.age * 0.6);
            this.shapePath(cc, sp, r);
            if (sp.fill && sp.shape !== 'cross') {
              cc.fillStyle = hsl(sp.color, alpha * 0.85);
              cc.fill();
              cc.strokeStyle = hsl({ ...sp.color, l: Math.min(95, sp.color.l + 25) }, alpha);
              cc.lineWidth = 2;
              cc.stroke();
            } else {
              cc.strokeStyle = hsl(sp.color, alpha * 0.25);
              cc.lineWidth = (sp.w || 3) * 4;
              cc.stroke();
              cc.strokeStyle = hsl(sp.color, alpha);
              cc.lineWidth = sp.w || 3;
              cc.stroke();
            }
            if (sp.shape === 'sun') {
              cc.strokeStyle = hsl(sp.color, alpha);
              cc.lineWidth = 4;
              for (let i = 0; i < 12; i++) {
                const a = (i * TAU) / 12 + sp.age;
                cc.beginPath();
                cc.moveTo(Math.cos(a) * r * 0.75, Math.sin(a) * r * 0.75);
                cc.lineTo(Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2);
                cc.stroke();
              }
            }
            cc.restore();
          });
          break;
        }
        case 'emoji': {
          const pop = sp.age < 0.3 ? easeOutBack(sp.age / 0.3) : 1;
          this.drawGlyph(
            c,
            sp.ch,
            sp.x,
            sp.y + Math.sin(sp.age * 6) * 6,
            (sp.size || 70) * pop,
            sp.rot + Math.sin(sp.age * 4) * 0.15,
            alpha,
          );
          break;
        }
        case 'text': {
          sp.y += (sp.vy || 0) * dt;
          const size = sp.size || 40;
          c.save();
          c.translate(sp.style === 'sub' ? 0 : sp.x, sp.y);
          const pop = sp.age < 0.2 ? easeOutBack(sp.age / 0.2) : 1;
          c.scale(pop, pop);
          c.font = `${sp.style === 'big' ? 'bold ' : ''}${size}px ${this.font}`;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          let txt = sp.s;
          if (sp.style === 'sub') {
            const n = Math.floor(sp.age * 30);
            txt = sp.s.slice(0, n) + (n < sp.s.length ? '█' : '');
            const w = sp.tw || (sp.tw = c.measureText(sp.s).width);
            c.fillStyle = `rgba(0,0,0,${0.6 * alpha})`;
            c.fillRect(-w / 2 - 14, -size * 0.7, w + 28, size * 1.4);
          }
          if (sp.style === 'big') {
            // chromatic aberration for big text
            c.globalCompositeOperation = 'lighter';
            c.fillStyle = `rgba(255,0,80,${alpha * 0.7})`;
            c.fillText(txt, -3 + Math.random() * 2, 0);
            c.fillStyle = `rgba(0,255,220,${alpha * 0.7})`;
            c.fillText(txt, 3 - Math.random() * 2, 0);
            c.globalCompositeOperation = 'source-over';
          }
          c.fillStyle = hsl(sp.color || { h: 120, s: 90, l: 70 }, alpha * 0.3);
          c.fillText(txt, 0, 2);
          c.fillStyle =
            sp.style === 'num' ? `rgba(160,255,255,${alpha})` : hsl({ ...(sp.color || { h: 120, s: 90, l: 70 }), l: 85 }, alpha);
          c.fillText(txt, 0, 0);
          c.restore();
          break;
        }
        case 'math': {
          const size = sp.big ? 44 : 36;
          const n = Math.min(sp.s.length, Math.floor(sp.age * 160)); // fast typewriter: results must be readable
          const txt = sp.s.slice(0, n);
          c.save();
          c.translate(sp.x, sp.y);
          c.font = `${size}px ${this.font}`;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          const w = sp.w || (sp.w = c.measureText(sp.s).width);
          const sc = Math.min(1, (this.hw * 1.7) / (w + 32));
          c.scale(sc, sc);
          c.fillStyle = `rgba(0,10,5,${0.88 * alpha})`;
          c.fillRect(-w / 2 - 16, -size * 0.75, w + 32, size * 1.5);
          c.strokeStyle = hsl(sp.color, alpha);
          c.lineWidth = 2;
          c.strokeRect(-w / 2 - 16, -size * 0.75, w + 32, size * 1.5);
          c.fillStyle = hsl({ ...sp.color, l: 88 }, alpha);
          c.textAlign = 'left';
          c.fillText(txt + (n < sp.s.length || ((sp.age * 3) | 0) % 2 ? '▌' : ''), -w / 2, 0);
          c.restore();
          break;
        }
      }
    }
    this.sprites = keep;
  }

  stampShape(sp: ShapeSprite): void {
    // a dying shape leaves a faint imprint in the paint layer
    const pc = this.pctx;
    pc.setTransform(this.s, 0, 0, this.s, this.W / 2, this.H / 2);
    pc.globalCompositeOperation = 'lighter';
    this.sym(pc, (cc) => {
      cc.save();
      cc.translate(sp.x, sp.y);
      cc.rotate(((sp.rot || 0) * Math.PI) / 180 + sp.age * 0.6);
      this.shapePath(cc, sp, sp.r * (1 + (sp.grow || 0)));
      cc.strokeStyle = hsl(sp.color, 0.3 * this.copyK);
      cc.lineWidth = 1.5;
      cc.stroke();
      cc.restore();
    });
    pc.globalCompositeOperation = 'source-over';
  }

  drawParticles(c: Ctx, dt: number): void {
    const keep: Particle[] = [];
    const T = this.time;
    for (const p of this.parts) {
      p.age += dt;
      if (p.age > p.life) continue;
      keep.push(p);
      p.vy += p.g * dt;
      const dr = Math.pow(p.drag, dt * 60);
      p.vx *= dr;
      p.vy *= dr;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.sway) p.x += Math.sin(T * p.sway + p.size) * 30 * dt;
      const t = p.age / p.life;
      const a = 1 - t;
      switch (p.kind) {
        case 'emoji':
          this.drawGlyph(c, p.ch ?? '✨', p.x, p.y, p.size, p.rot, Math.min(1, a * 2));
          break;
        case 'char':
        case 'matrix': {
          if (p.kind === 'matrix' && Math.random() < 0.1) p.ch = SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0];
          const col = p.kind === 'matrix' ? '#78ff8c' : `hsl(${(Math.round(p.c.h / 30) * 30) % 360},${p.c.s | 0}%,80%)`;
          this.drawGlyph(c, p.ch ?? '*', p.x, p.y, p.size, 0, a, false, col);
          break;
        }
        case 'rect':
          c.save();
          c.translate(p.x, p.y);
          c.rotate(p.rot);
          c.scale(1, Math.cos(p.rot * 2));
          c.fillStyle = hsl(p.c, Math.min(1, a * 2));
          c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          c.restore();
          break;
        case 'star': {
          c.globalCompositeOperation = 'lighter';
          const r = p.size * (0.6 + 0.4 * Math.sin(p.age * 20));
          c.fillStyle = hsl(p.c, a);
          c.beginPath();
          c.moveTo(p.x, p.y - r);
          c.lineTo(p.x + r * 0.2, p.y - r * 0.2);
          c.lineTo(p.x + r, p.y);
          c.lineTo(p.x + r * 0.2, p.y + r * 0.2);
          c.lineTo(p.x, p.y + r);
          c.lineTo(p.x - r * 0.2, p.y + r * 0.2);
          c.lineTo(p.x - r, p.y);
          c.lineTo(p.x - r * 0.2, p.y - r * 0.2);
          c.fill();
          c.globalCompositeOperation = 'source-over';
          break;
        }
        case 'fire': {
          c.globalCompositeOperation = 'lighter';
          c.fillStyle = `hsla(${(50 - t * 50) | 0},100%,${(65 - t * 25) | 0}%,${a * 0.8})`;
          c.beginPath();
          c.arc(p.x, p.y, p.size * (1 - t * 0.6), 0, TAU);
          c.fill();
          c.globalCompositeOperation = 'source-over';
          break;
        }
        case 'rain':
          c.strokeStyle = hsl(p.c, 0.7);
          c.lineWidth = 2;
          c.beginPath();
          c.moveTo(p.x, p.y);
          c.lineTo(p.x - p.vx * 0.02, p.y - p.size);
          c.stroke();
          break;
        case 'smoke':
          c.fillStyle = hsl(p.c, a * 0.18);
          c.beginPath();
          c.arc(p.x, p.y, p.size * (1 + t * 1.5), 0, TAU);
          c.fill();
          break;
        case 'bubble':
          c.strokeStyle = hsl(p.c, a);
          c.lineWidth = 2;
          c.beginPath();
          c.arc(p.x, p.y, p.size, 0, TAU);
          c.stroke();
          c.fillStyle = `rgba(255,255,255,${a * 0.6})`;
          c.beginPath();
          c.arc(p.x - p.size * 0.35, p.y - p.size * 0.35, p.size * 0.2, 0, TAU);
          c.fill();
          break;
        case 'warp': {
          c.strokeStyle = hsl(p.c, a);
          c.lineWidth = 2;
          c.beginPath();
          c.moveTo(p.x, p.y);
          c.lineTo(p.x - p.vx * 0.06, p.y - p.vy * 0.06);
          c.stroke();
          break;
        }
        default: {
          c.globalCompositeOperation = 'lighter';
          c.fillStyle = hsl(p.c, a);
          c.beginPath();
          c.arc(p.x, p.y, p.size, 0, TAU);
          c.fill();
          c.globalCompositeOperation = 'source-over';
        }
      }
    }
    this.parts = keep;
  }

  drawActors(c: Ctx, dt: number): void {
    const keep: Actor[] = [];
    for (const a of this.actors) {
      a.age += dt;
      if (a.age < 0) {
        keep.push(a);
        continue;
      }
      if (a.age > a.life) {
        if (a.kind === 'firework') {
          this.spawn({ kind: 'burst', n: 90, x: a.x, y: a.ty, color: a.color, spread: 1.4 });
          this.spawn({ kind: 'stars', n: 20, x: a.x, y: a.ty, color: a.color });
          this.flashes.push({ c: a.color, a: 0.15, t: 0 });
        }
        if (a.kind === 'rocket') {
          this.spawn({ kind: 'burst', n: 120, x: a.x, y: -this.hh * 0.8, color: { h: 30, s: 100, l: 60 }, spread: 1.6 });
          this.flashes.push({ c: { h: 40, s: 100, l: 80 }, a: 0.4, t: 0 });
        }
        continue;
      }
      keep.push(a);
      const t = a.age / a.life;
      const fadeA = Math.min(1, (a.life - a.age) * 3, a.age * 6);
      switch (a.kind) {
        case 'run':
        case 'drive': {
          a.x += a.vx * dt;
          const hop = a.kind === 'run' ? -Math.abs(Math.sin(a.age * 14)) * 30 : Math.sin(a.age * 40) * 2;
          this.drawGlyph(c, a.ch, a.x, a.y + hop, a.size, Math.sin(a.age * 14) * 0.15, fadeA, a.dir > 0);
          if (a.kind === 'drive' && Math.random() < 0.5)
            this.spawn({ kind: 'smoke', n: 1, x: a.x - a.dir * 40, y: a.y + 10, color: { h: 0, s: 0, l: 50 } });
          if (a.kind === 'run' && Math.random() < 0.15)
            this.spawn({ kind: 'dots', n: 2, x: a.x, y: a.y + 30, color: { h: 40, s: 30, l: 70 } });
          break;
        }
        case 'fly':
        case 'swim': {
          a.x += a.vx * dt;
          const y = a.y0 + Math.sin(a.age * (a.kind === 'fly' ? 5 : 2.5)) * (a.kind === 'fly' ? 60 : 30);
          this.drawGlyph(c, a.ch, a.x, y, a.size, Math.cos(a.age * 5) * 0.2, fadeA, a.dir > 0);
          if (a.kind === 'swim' && Math.random() < 0.1) this.spawn({ kind: 'bubbles', n: 1, x: a.x, y });
          break;
        }
        case 'ufo': {
          a.x += a.vx * dt;
          c.fillStyle = `rgba(150,255,170,${0.15 * fadeA})`;
          c.beginPath();
          c.moveTo(a.x - 15, a.y + 20);
          c.lineTo(a.x + 15, a.y + 20);
          c.lineTo(a.x + 90, this.hh);
          c.lineTo(a.x - 90, this.hh);
          c.fill();
          this.drawGlyph(c, a.ch || '🛸', a.x, a.y + Math.sin(a.age * 4) * 10, a.size, 0, fadeA);
          break;
        }
        case 'stomp': {
          a.x += a.vx * dt;
          const step = Math.floor(a.age * 3);
          if (step !== a.step) {
            a.step = step;
            this.view.shake = Math.min(40, this.view.shake + 12);
            this.spawn({ kind: 'dots', n: 10, x: a.x, y: a.y + a.size * 0.5, color: { h: 30, s: 30, l: 60 } });
          }
          this.drawGlyph(c, a.ch, a.x, a.y - Math.abs(Math.sin(a.age * Math.PI * 3)) * 20, a.size, 0, fadeA, a.dir > 0);
          break;
        }
        case 'float':
          this.drawGlyph(
            c,
            a.ch,
            a.x + Math.sin(a.age * 3) * 40,
            a.y - a.age * 80,
            a.size * (1 + t * 0.6),
            Math.sin(a.age * 4) * 0.3,
            fadeA * (0.6 + 0.4 * Math.sin(a.age * 25)),
          );
          break;
        case 'rocket':
          a.y += a.vy * dt;
          this.drawGlyph(c, a.ch || '🚀', a.x, a.y, a.size, -Math.PI / 4, 1);
          this.spawn({ kind: 'fire', n: 3, x: a.x, y: a.y + 40 });
          break;
        case 'ball': {
          a.vy += 1400 * dt;
          a.x += a.vx * dt;
          a.y += a.vy * dt;
          if (a.y > this.hh - 30) {
            a.y = this.hh - 30;
            a.vy *= -0.8;
            this.spawn({ kind: 'dots', n: 6, x: a.x, y: a.y + 20, color: { h: 60, s: 80, l: 70 } });
          }
          if (Math.abs(a.x) > this.hw - 30) {
            a.x = Math.sign(a.x) * (this.hw - 30);
            a.vx *= -0.9;
          }
          this.drawGlyph(c, a.ch, a.x, a.y, a.size, a.age * a.vx * 0.01, fadeA);
          break;
        }
        case 'firework': {
          const y = this.hh + (a.ty - this.hh) * (1 - Math.pow(1 - t, 2));
          c.globalCompositeOperation = 'lighter';
          c.fillStyle = hsl(a.color, 1);
          c.beginPath();
          c.arc(a.x, y, 4, 0, TAU);
          c.fill();
          c.globalCompositeOperation = 'source-over';
          if (Math.random() < 0.6) this.spawn({ kind: 'dots', n: 1, x: a.x, y: y + 10, color: { h: 40, s: 80, l: 70 } });
          break;
        }
        default: {
          // pop
          const pop = a.age < 0.35 ? easeOutBack(a.age / 0.35) : 1;
          this.drawGlyph(c, a.ch, a.x, a.y, a.size * 1.3 * pop, Math.sin(a.age * 9) * 0.25, fadeA);
        }
      }
    }
    this.actors = keep;
  }

  drawBanner(c: Ctx, dt: number): void {
    const b = this.banner;
    if (!b) return;
    b.age += dt;
    if (b.age > b.life) {
      this.banner = null;
      return;
    }
    const { W, H } = this;
    const k = Math.min(1, b.age * 8, (b.life - b.age) * 6);
    const fs = Math.min((W / Math.max(10, b.text.length)) * 1.4, H * 0.09);
    const bh = fs * (b.progress ? 2.6 : 1.9);
    c.save();
    c.translate(0, H * 0.42);
    c.fillStyle = `rgba(0,0,0,${0.82 * k})`;
    c.fillRect(0, (-bh / 2) * k, W, bh * k);
    c.strokeStyle = `rgba(80,255,120,${k})`;
    c.lineWidth = 2 * this.dpr;
    c.beginPath();
    c.moveTo(0, (-bh / 2) * k);
    c.lineTo(W, (-bh / 2) * k);
    c.moveTo(0, (bh / 2) * k);
    c.lineTo(W, (bh / 2) * k);
    c.stroke();
    // scramble -> resolve
    const resolved = Math.floor(b.age * 26);
    let s = '';
    for (let i = 0; i < b.text.length; i++)
      s += i < resolved || b.text[i] === ' ' ? b.text[i] : SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0];
    c.font = `bold ${fs | 0}px ${this.font}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = `rgba(0,255,90,${0.35 * k})`;
    c.fillText(s, W / 2 + 2, (b.progress ? -fs * 0.35 : 0) + 2);
    c.fillStyle = `rgba(190,255,200,${k})`;
    c.fillText(s, W / 2, b.progress ? -fs * 0.35 : 0);
    if (b.progress) {
      const pw = W * 0.6,
        ph = fs * 0.4,
        p = Math.min(1, b.age / (b.life * 0.7));
      c.strokeStyle = `rgba(80,255,120,${k})`;
      c.strokeRect(W / 2 - pw / 2, fs * 0.45, pw, ph);
      c.fillStyle = `rgba(80,255,120,${k})`;
      c.fillRect(W / 2 - pw / 2 + 3, fs * 0.45 + 3, (pw - 6) * p, ph - 6);
      c.font = `${(fs * 0.4) | 0}px ${this.font}`;
      c.fillText(`${(p * 100) | 0}%`, W / 2, fs * 0.45 + ph * 1.9);
    }
    c.restore();
  }

  post(c: Ctx, dt: number): void {
    const { W, H } = this;
    const T = this.time;
    // flashes
    for (const f of this.flashes) {
      f.t += dt;
      const a = f.a * Math.max(0, 1 - f.t / 0.25);
      if (a > 0.003) {
        c.fillStyle = hsl(f.c, a);
        c.fillRect(0, 0, W, H);
      }
    }
    this.flashes = this.flashes.filter((f) => f.t < 0.25);
    // siren
    if (this.sirenUntil > T) {
      c.fillStyle = ((T * 6) | 0) % 2 ? 'rgba(255,0,40,0.18)' : 'rgba(0,80,255,0.18)';
      c.fillRect(0, 0, W, H);
    }
    // glitch
    if (this.glitchUntil > T) {
      const g = this.glitchAmt;
      const n = 2 + ((g * 8) | 0);
      for (let i = 0; i < n; i++) {
        const y = Math.random() * H,
          h = rand(4, 40) * this.dpr * (0.5 + g),
          dx = (Math.random() - 0.5) * g * 120 * this.dpr;
        c.drawImage(this.cv, 0, y, W, h, dx, y, W, h);
      }
      // colour fringe without brightening the frame
      c.globalCompositeOperation = 'lighten';
      c.globalAlpha = Math.min(0.6, 0.3 * g);
      c.drawImage(this.cv, (Math.random() * 10 + 4) * g * this.dpr, 0);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
      if (Math.random() < 0.4 * g) {
        for (let i = 0; i < 3; i++) {
          c.fillStyle = `hsla(${[120, 300, 180][i]},100%,55%,0.35)`;
          c.fillRect(Math.random() * W, Math.random() * H, rand(20, 200) * this.dpr, rand(4, 30) * this.dpr);
        }
      }
    } else this.glitchAmt *= 0.5;
    if (this.invertUntil > T && ((T * 14) | 0) % 2) {
      c.globalCompositeOperation = 'difference';
      c.fillStyle = '#fff';
      c.fillRect(0, 0, W, H);
      c.globalCompositeOperation = 'source-over';
    }
  }

  // tap-to-world helper for the UI
  toWorld(cssX: number, cssY: number): Point {
    const x = cssX * this.dpr,
      y = cssY * this.dpr;
    return [(x - this.W / 2) / this.s, (y - this.H / 2) / this.s];
  }
}
