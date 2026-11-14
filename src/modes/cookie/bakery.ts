// The bakery: one batch from dough ball to crumbs. A timeline of stages moves the Look (what the
// renderer draws), taps bite into the cookies' fields, crumbs fall and bounce. Pure, DOM-free:
// the player feeds it time and taps, the renderer reads it.
import { hash, mulberry32 } from '../../lang/rng';
import { readRecipe, recipeKey, CHOC } from './recipe';
import type { Dough, Recipe, RGB, Stage, Topping } from './recipe';
import { Field, outline, FIELD_EXT } from './shapes';

export interface Cookie {
  x: number;
  z: number;
  rot: number;
  field: Field;
  gone: boolean;
  seed: number;
}
export interface Crumb {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  color: RGB;
  seed: number;
  rest: boolean;
  /** 1 while it lives; runs down to 0 when it is swept away */
  life: number;
  /** it has touched the floor once */
  hit: boolean;
}
/** every value eased, continuous in time */
export interface Look {
  /** centre height of the dough; equals doughT once it has landed */
  ballY: number;
  /** radius and half-thickness of the dough as a rounded cylinder; R below T is a ball */
  doughR: number;
  doughT: number;
  /** 0..1 landing wobble */
  squash: number;
  /** rolling pin x, travel direction ±1, presence 0..1 (it lifts in and out) */
  pinX: number;
  pinDir: number;
  pin: number;
  /** half-thickness ahead of and behind the pin */
  tBefore: number;
  tAfter: number;
  flour: number;
  /** cutter height above the tray, presence 0..1 */
  cutterY: number;
  cutter: number;
  /** ring cut out of the scrap around each outline; 0 = uncut, > 3 = scrap gone */
  gap: number;
  /** rounding of the cookie's top edge, 0..1 */
  edge: number;
  /** seconds since chips started to drop, -1 before */
  chipT: number;
  /** 0..1 oven light */
  heat: number;
  /** 0..recipe.bake */
  baked: number;
  /** 0..1 share of the rise reached */
  puff: number;
  /** 0..1 reveal */
  coat: number;
  pattern: number;
  /** seconds since toppings started to fall, -1 before */
  topT: number;
  /** 0..1: eyes, pearls, extra pop in, letters and mouth are piped */
  deco: number;
  /** 0..1 camera move to the serving view */
  hero: number;
  /** 0 = whole; grows during sweep until nothing is left */
  erode: number;
}
export type BakeEvent =
  | { type: 'stage'; stage: Stage }
  | { type: 'thud'; vel: number }
  | { type: 'roll'; dur: number; dir: number }
  | { type: 'cut'; pan: number }
  | { type: 'chip'; pan: number }
  | { type: 'tick' }
  | { type: 'ding' }
  | { type: 'pour' }
  | { type: 'sprinkle'; pan: number }
  | { type: 'place'; pan: number }
  | { type: 'ready' }
  | { type: 'bite'; pan: number }
  | { type: 'crumb'; pan: number; vel: number }
  | { type: 'gone'; pan: number }
  | { type: 'sweep' };

export const MAX_CRUMBS = 240;
/** above this the oldest crumbs start to fade, so the hard limit is never a visible pop */
const SOFT_CRUMBS = 200;

export const DOUGH: Record<Dough, { raw: RGB; baked: RGB }> = {
  butter: { raw: [0.93, 0.84, 0.62], baked: [0.82, 0.58, 0.28] },
  ginger: { raw: [0.62, 0.4, 0.22], baked: [0.45, 0.25, 0.11] },
  cocoa: { raw: [0.36, 0.22, 0.15], baked: [0.22, 0.12, 0.08] },
  oat: { raw: [0.85, 0.74, 0.55], baked: [0.72, 0.5, 0.27] },
  matcha: { raw: [0.66, 0.76, 0.42], baked: [0.55, 0.6, 0.26] },
};
export const CHAR: RGB = [0.07, 0.05, 0.04];
/** sprinkle colours; the shader picks by hash, crumbs by chance */
export const CANDY: readonly RGB[] = [
  [0.93, 0.25, 0.3],
  [0.99, 0.8, 0.25],
  [0.35, 0.75, 0.45],
  [0.35, 0.6, 0.95],
  [0.97, 0.55, 0.75],
  [0.97, 0.96, 0.93],
];
const TOP_COLOR: Record<Topping, () => RGB> = {
  sprinkles: () => CANDY[Math.floor(Math.random() * CANDY.length)]!,
  sugar: () => [0.97, 0.97, 0.95],
  strands: () => CHOC.dark,
  pearls: () => [0.8, 0.82, 0.86],
};

const ORDER: readonly Stage[] = [
  'drop',
  'roll',
  'cut',
  'chips',
  'bake',
  'cool',
  'coat',
  'pattern',
  'toppings',
  'deco',
  'present',
  'serve',
  'sweep',
];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const sat = (v: number) => clamp(v, 0, 1);
const ss = (a: number, b: number, x: number) => {
  const t = sat((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mix3 = (a: RGB, b: RGB, t: number): RGB => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

const FALL = 0.7; // seconds the ball falls
const PIN_LIFT = 0.35;
const PASS = 1.1;

interface ActiveBite {
  cookie: Cookie;
  cx: number;
  cy: number;
  r: number;
  target: number;
  phase: number;
  t: number;
  dur: number;
  /** the last bite of a cookie: it crumbles */
  last: boolean;
}

export class Bakery {
  recipe: Recipe;
  /** the edited recipe that the next batch will bake */
  pending: Recipe | null = null;
  cookies: Cookie[] = [];
  crumbs: Crumb[] = [];
  stage: Stage = 'drop';
  /** progress 0..1 in the stage */
  u = 0;
  look!: Look;
  /** counts up with every new tray */
  batch = -1;
  /** final radius of the rolled dough */
  sheetR = 1;
  /** how far the outermost cookie's centre is from the middle */
  layoutR = 0;
  gentle = false;
  /** used for the layout of the next batch */
  aspect: number;
  /** radius of the dough ball */
  r0 = 1;

  private t = 0; // seconds into the stage
  private speed = 1;
  private rush = false;
  private cues: [number, BakeEvent][] = [];
  private cue = 0;
  private queued: BakeEvent[] = [];
  private active: ActiveBite | null = null;
  private goneT = 0;
  private crumbN = 0;
  private rnd: () => number = Math.random;

  constructor(src: unknown, aspect: number) {
    this.recipe = readRecipe(src);
    this.aspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
    this.newBatch();
  }

  /** height of a baked cookie's top */
  get top(): number {
    return this.recipe.thickness * (1 + 0.6 * this.recipe.rise);
  }

  /** seconds left on the oven timer as shown, minutes * 60 scaled onto the bake stage */
  timer(): number {
    const all = this.recipe.minutes * 60;
    const i = ORDER.indexOf(this.stage);
    if (this.stage === 'bake') return all * (1 - sat(this.t / 4.2));
    return i < ORDER.indexOf('bake') ? all : 0;
  }

  /** a point of the tray in a cookie's own frame (x right, y to the back) */
  toLocal(c: Cookie, x: number, z: number): [number, number] {
    const s = this.recipe.size;
    const vx = (x - c.x) / s;
    const vy = -(z - c.z) / s;
    const co = Math.cos(c.rot);
    const si = Math.sin(c.rot);
    return [co * vx + si * vy, -si * vx + co * vy];
  }

  toWorld(c: Cookie, lx: number, ly: number): [number, number] {
    const s = this.recipe.size;
    const co = Math.cos(c.rot);
    const si = Math.sin(c.rot);
    return [c.x + s * (co * lx - si * ly), c.z - s * (si * lx + co * ly)];
  }

  private newBatch(): void {
    this.batch++;
    if (this.pending) this.recipe = this.pending;
    this.pending = null;
    this.speed = this.rush ? 2.5 : 1;
    this.rush = false;
    const r = this.recipe;
    this.rnd = mulberry32(hash(r.seed + ':' + this.batch));
    // far enough apart that the middle between two centres is past every cutter's reach (the shader draws the nearest cookie)
    const P = 2.55 * r.size;
    const at: [number, number][] =
      r.count === 1
        ? [[0, 0]]
        : r.count === 2
          ? this.aspect >= 1
            ? [
                [-P / 2, 0],
                [P / 2, 0],
              ]
            : [
                [0, -P / 2],
                [0, P / 2],
              ]
          : this.aspect >= 1.5
            ? [
                [-P, 0],
                [0, 0],
                [P, 0],
              ]
            : [
                [-P / 2, -0.5 * P],
                [P / 2, -0.5 * P],
                [0, 0.5 * P],
              ];
    this.cookies = at.map(([x, z], i) => {
      const seed = hash(r.seed + ':' + this.batch + ':' + i);
      const rnd = mulberry32(seed);
      return {
        x,
        z,
        rot: r.rotation + (rnd() - 0.5) * 0.28,
        field: new Field(outline(r.shape, r.variant, r.wobble, seed)),
        gone: false,
        seed,
      };
    });
    this.layoutR = Math.max(...at.map(([x, z]) => Math.hypot(x, z)));
    this.sheetR = this.layoutR + 1.3 * r.size + 0.3;
    // the ball holds exactly the dough of the rolled sheet
    this.r0 = Math.cbrt(0.75 * this.sheetR * this.sheetR * r.thickness);
    this.crumbs = [];
    this.active = null;
    this.goneT = 0;
    this.look = {
      ballY: 4.2,
      doughR: 0,
      doughT: this.r0,
      squash: 0,
      pinX: -(this.sheetR + 1.2),
      pinDir: 1,
      pin: 0,
      tBefore: this.r0,
      tAfter: this.r0,
      flour: 0,
      cutterY: 2.6,
      cutter: 0,
      gap: 0,
      edge: 0,
      chipT: -1,
      heat: 0,
      baked: 0,
      puff: 0,
      coat: 0,
      pattern: 0,
      topT: -1,
      deco: 0,
      hero: 0,
      erode: 0,
    };
    this.enter('drop');
  }

  private len(s: Stage): number {
    const r = this.recipe;
    switch (s) {
      case 'drop':
        return 1.6;
      case 'roll':
        return 4;
      case 'cut':
        return 2.8;
      case 'chips':
        return r.chips > 0 ? 1 : 0;
      case 'bake':
        return 5;
      case 'cool':
        return 0.8;
      case 'coat':
        return r.coat !== 'none' ? 2 : 0;
      case 'pattern':
        return r.pattern !== 'plain' || r.border ? 1.2 : 0;
      case 'toppings':
        return r.toppings.length || r.glitter > 0 ? 1.8 : 0;
      case 'deco':
        return r.face !== 'none' || r.letters.length || r.extra ? 1.2 : 0;
      case 'present':
        return 1.2;
      case 'serve':
        return Infinity;
      case 'sweep':
        return 1.4;
    }
  }

  private pan(c: Cookie | undefined): number {
    return c ? clamp(c.x / Math.max(1, this.sheetR), -1, 1) : 0;
  }

  private enter(s: Stage): void {
    this.stage = s;
    this.t = 0;
    this.u = 0;
    this.cue = 0;
    this.queued.push({ type: 'stage', stage: s });
    const cues: [number, BakeEvent][] = [];
    const cs = this.cookies;
    switch (s) {
      case 'drop':
        cues.push([FALL, { type: 'thud', vel: 0.9 }]);
        break;
      case 'roll':
        for (let k = 0; k < 3; k++) cues.push([PIN_LIFT + k * PASS, { type: 'roll', dur: PASS, dir: k % 2 ? -1 : 1 }]);
        break;
      case 'cut':
        cs.forEach((c, i) => cues.push([0.7 + i * 0.12, { type: 'cut', pan: this.pan(c) }]));
        break;
      case 'chips': {
        const n = Math.min(6, this.recipe.chips);
        for (let i = 0; i < n; i++) cues.push([0.05 + (i * 0.6) / n, { type: 'chip', pan: this.pan(cs[i % cs.length]) }]);
        break;
      }
      case 'bake':
        for (let t = 0.5; t < 4.2; t += 0.5) cues.push([t, { type: 'tick' }]);
        cues.push([4.2, { type: 'ding' }]);
        break;
      case 'coat':
        cues.push([0, { type: 'pour' }]);
        break;
      case 'toppings':
        for (let i = 0; i < 10; i++) cues.push([0.1 + i * 0.12, { type: 'sprinkle', pan: this.pan(cs[i % cs.length]) }]);
        break;
      case 'deco':
        [0.1, 0.4, 0.7].forEach((t, i) => cues.push([t, { type: 'place', pan: this.pan(cs[i % cs.length]) }]));
        break;
      case 'present':
        cues.push([1.2, { type: 'ready' }]);
        break;
      case 'sweep':
        cues.push([0, { type: 'sweep' }]);
        this.active = null;
        break;
      default:
        break;
    }
    this.cues = cues;
  }

  /** set the look for the current stage at its local time */
  private pose(): void {
    const L = this.look;
    const r = this.recipe;
    const t = this.t;
    const half = r.thickness / 2;
    switch (this.stage) {
      case 'drop': {
        const f = sat(t / FALL);
        L.ballY = mix(4.2, this.r0, f * f);
        const tau = t - FALL;
        L.squash = tau > 0 && !this.gentle ? ss(0, 0.07, tau) * Math.exp(-5 * tau) * (0.55 + 0.45 * Math.cos(13 * tau)) : 0;
        break;
      }
      case 'roll': {
        const h = [this.r0, this.r0 * 0.5, mix(this.r0 * 0.5, half, 0.75), half];
        const R = (hh: number) => Math.min(this.sheetR, Math.sqrt((this.r0 ** 3 * 4) / 3 / (2 * hh)));
        const k = clamp(Math.floor((t - PIN_LIFT) / PASS), 0, 2);
        const f = sat((t - PIN_LIFT - k * PASS) / PASS);
        const dir = k % 2 ? -1 : 1;
        const far = this.sheetR + 1.2;
        L.pinDir = dir;
        L.pinX = dir * mix(-far, far, ss(0, 1, f));
        L.pin = Math.min(ss(0, PIN_LIFT, t), 1 - ss(4 - PIN_LIFT, 4, t));
        L.tBefore = h[k]!;
        L.tAfter = h[k + 1]!;
        // the sheet widens under the pin, not ahead of it
        L.doughR = mix(R(h[k]!), R(h[k + 1]!), ss(0.1, 0.9, f));
        L.doughT = t >= 4 - PIN_LIFT ? half : h[k + 1]!;
        if (t >= 4 - PIN_LIFT) {
          L.tBefore = L.tAfter = half;
          L.doughR = this.sheetR;
        }
        L.ballY = L.doughT;
        L.squash = 0;
        L.flour = Math.max(L.flour, ss(PIN_LIFT, PIN_LIFT + PASS, t));
        break;
      }
      case 'cut': {
        L.pin = 0;
        L.tBefore = L.tAfter = L.doughT = L.ballY = half;
        L.doughR = this.sheetR;
        L.flour = 1;
        const down = sat(t / 0.7);
        L.cutterY = t < 1 ? 2.6 * (1 - down * down) : 2.6 * ss(1, 1.7, t);
        L.cutter = Math.min(ss(0, 0.2, t), 1 - ss(1.3, 1.7, t));
        L.gap = t < 0.75 ? 0 : mix(0.03, 4, sat((t - 1.5) / 1.3) ** 2.2);
        L.edge = ss(1.5, 2.8, t);
        break;
      }
      case 'chips':
        L.chipT = t;
        break;
      case 'bake': {
        L.heat = t < 4.2 ? ss(0, 0.8, t) : mix(1, 0.15, ss(4.2, 5, t));
        const f = sat((t - 0.6) / 3.6);
        L.baked = r.bake * f;
        L.puff = 1 - (1 - f) ** 2.5;
        break;
      }
      case 'cool':
        L.heat = 0.15 * (1 - ss(0, 0.8, t));
        break;
      case 'coat':
        L.coat = ss(0, 2, t);
        break;
      case 'pattern':
        L.pattern = ss(0, 1.2, t);
        break;
      case 'toppings':
        L.topT = t;
        break;
      case 'deco':
        L.deco = ss(0, 1.2, t);
        break;
      case 'present':
        L.hero = ss(0, 1.2, t);
        break;
      case 'serve':
        break;
      case 'sweep': {
        const f = sat(t / 1.4);
        L.erode = 2 * f * f;
        L.pin = 0;
        L.cutter = 0;
        for (const c of this.crumbs) c.life = Math.min(c.life, 1 - f);
        break;
      }
    }
    // the falling pieces keep their clock, so late ones still land
    if (this.stage !== 'chips' && L.chipT >= 0) L.chipT = 3;
    if (this.stage !== 'toppings' && L.topT >= 0) L.topT = 3;
  }

  private next(): void {
    if (this.stage === 'sweep') {
      this.newBatch();
      return;
    }
    let i = ORDER.indexOf(this.stage) + 1;
    while (this.len(ORDER[i]!) === 0) i++;
    this.enter(ORDER[i]!);
  }

  tick(dt: number): BakeEvent[] {
    const out = this.queued;
    this.queued = [];
    let left = Number.isFinite(dt) ? clamp(dt, 0, 1) : 0;
    for (let guard = 0; guard < 32; guard++) {
      out.push(...this.queued);
      this.queued = [];
      if (this.stage === 'serve') {
        this.serve(left, out);
        break;
      }
      const len = this.len(this.stage);
      const rate = this.stage === 'sweep' ? 1 : this.speed;
      const need = (len - this.t) / rate;
      const done = left >= need;
      this.t = done ? len : this.t + left * rate;
      this.u = this.t / len;
      this.pose();
      while (this.cue < this.cues.length && this.cues[this.cue]![0] <= this.t) out.push(this.cues[this.cue++]![1]);
      if (!done) break;
      left -= need;
      this.next();
    }
    out.push(...this.queued);
    this.queued = [];
    this.fall(Number.isFinite(dt) ? clamp(dt, 0, 0.1) : 0, out);
    return out;
  }

  /** live edit; true if the picture will change */
  swap(src: unknown): boolean {
    const next = readRecipe(src);
    const cur = this.pending ?? this.recipe;
    if (recipeKey(next) === recipeKey(cur)) {
      cur.gs = next.gs;
      cur.marks = next.marks;
      return false;
    }
    this.pending = next;
    this.rush = true;
    if (this.stage !== 'sweep') this.enter('sweep');
    return true;
  }

  // ---- eating --------------------------------------------------------------

  /** a tap: ray in world space; false if it hit nothing edible */
  bite(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): boolean {
    if (this.stage !== 'serve' || !(dy < -1e-6)) return false;
    while (this.active) this.grow(Infinity, this.queued);
    const k = (this.top - oy) / dy;
    const x = ox + dx * k;
    const z = oz + dz * k;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    let best: Cookie | null = null;
    let bd = 0.08;
    let bx = 0;
    let by = 0;
    for (const c of this.cookies) {
      if (c.gone) continue;
      const [lx, ly] = this.toLocal(c, x, z);
      const d = c.field.d(lx, ly);
      if (d < bd) {
        bd = d;
        best = c;
        bx = lx;
        by = ly;
      }
    }
    if (!best) return false;
    const target = 0.34 * (0.9 + 0.2 * this.rnd());
    this.active = { cookie: best, cx: bx, cy: by, r: 0, target, phase: this.rnd() * 6.2832, t: 0, dur: 0.14, last: false };
    this.queued.push({ type: 'bite', pan: this.pan(best) });
    const n = Math.round((10 + this.rnd() * 6) * (this.gentle ? 0.5 : 1));
    this.scatter(best, bx, by, target, n, true);
    return true;
  }

  /** the active bite opens a little further; when it is done the cookie may crumble */
  private grow(dt: number, out: BakeEvent[]): void {
    const a = this.active;
    if (!a) return;
    a.t = Math.min(a.dur, a.t + dt);
    const f = a.t / a.dur;
    a.r = a.target * (1 - (1 - f) * (1 - f));
    a.cookie.field.bite(a.cx, a.cy, a.r, a.phase);
    if (a.t < a.dur) return;
    this.active = null;
    const c = a.cookie;
    if (a.last) {
      c.gone = true;
      out.push({ type: 'gone', pan: this.pan(c) });
    } else if (c.field.left() < 0.08) {
      const [cx, cy] = c.field.centroid() ?? [0, 0];
      this.scatter(c, cx, cy, 0.3, 8, false);
      this.active = { cookie: c, cx, cy, r: 0, target: 1.6, phase: a.phase, t: 0, dur: 0.3, last: true };
    }
  }

  /** crumbs fly from a bite: mostly cookie, some coating, a few toppings */
  private scatter(c: Cookie, cx: number, cy: number, radius: number, n: number, toppings: boolean): void {
    const r = this.recipe;
    const d = DOUGH[r.dough];
    const inside = mix3(d.raw, d.baked, 0.35).map((v) => Math.min(1, v * 1.1)) as RGB;
    const crust = mix3(mix3(d.raw, d.baked, sat(r.bake)), CHAR, sat((r.bake * 0.85 - 1.1) / 0.35));
    const top = this.top;
    let extra = 0;
    if (toppings) {
      // about how many pieces sat inside the bite
      const cell = r.toppings.length ? mix(0.3, 0.16, r.toppings[0]!.amount) : 0.3;
      const pieces = r.toppings.length || r.chips ? (Math.PI * radius * radius) / (cell * cell) : 0;
      extra = Math.min(5, Math.floor(pieces / 3));
    }
    let made = 0;
    for (let tries = 0; tries < n * 4 && made < n; tries++) {
      const ang = this.rnd() * 6.2832;
      const rr = radius * (0.4 + 0.6 * this.rnd());
      const lx = cx + Math.cos(ang) * rr;
      const ly = cy + Math.sin(ang) * rr;
      if (c.field.d(lx, ly) >= 0) continue;
      const [x, z] = this.toWorld(c, lx, ly);
      let ox = x - c.x;
      let oz = z - c.z;
      const ol = Math.hypot(ox, oz);
      if (ol < 0.05) {
        ox = Math.cos(ang);
        oz = Math.sin(ang);
      } else {
        ox /= ol;
        oz /= ol;
      }
      const sp = 0.6 + 1.2 * this.rnd();
      const pick = this.rnd();
      let color: RGB = pick < 0.5 ? inside : pick < 0.75 ? crust : r.coat !== 'none' ? r.color : inside;
      if (made < extra) color = r.toppings.length ? TOP_COLOR[r.toppings[made % r.toppings.length]!.kind]() : CHOC.dark;
      this.crumbs.push({
        x,
        y: top * (0.2 + 0.8 * this.rnd()),
        z,
        vx: ox * sp + (this.rnd() - 0.5) * 0.5,
        vy: 1.2 + 1.4 * this.rnd(),
        vz: oz * sp + (this.rnd() - 0.5) * 0.5,
        r: (0.02 + 0.04 * this.rnd() * this.rnd()) * r.size,
        color,
        seed: this.crumbN++,
        rest: false,
        life: 1,
        hit: false,
      });
      made++;
    }
  }

  /** the floor under a crumb: a cookie's top where one is left, else the tray */
  private floor(x: number, z: number): number {
    for (const c of this.cookies) {
      if (c.gone) continue;
      const [lx, ly] = this.toLocal(c, x, z);
      if (Math.abs(lx) < FIELD_EXT && Math.abs(ly) < FIELD_EXT && c.field.d(lx, ly) < 0) return this.top;
    }
    return 0;
  }

  private fall(dt: number, out: BakeEvent[]): void {
    const cr = this.crumbs;
    if (!cr.length || dt <= 0) return;
    let alive = 0;
    for (const c of cr) {
      if (c.life < 1 && this.stage !== 'sweep') c.life -= dt / 0.4;
      else alive++;
      const fl = this.floor(c.x, c.z) + c.r * 0.6;
      if (c.rest) {
        if (c.y > fl + 0.01) c.rest = false; // the cookie under it was bitten away
        else continue;
      }
      c.vy -= 9.8 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.z += c.vz * dt;
      if (c.y <= fl) {
        c.y = fl;
        if (!c.hit) {
          c.hit = true;
          if (c.seed % 3 === 0) out.push({ type: 'crumb', pan: clamp(c.x / Math.max(1, this.sheetR), -1, 1), vel: sat(-c.vy / 4) });
        }
        c.vy = -c.vy * 0.28;
        c.vx *= 0.6;
        c.vz *= 0.6;
        if (Math.hypot(c.vx, c.vy, c.vz) < 0.15) {
          c.rest = true;
          c.vx = c.vy = c.vz = 0;
        }
      }
    }
    // too many: the oldest fade out
    for (let i = 0; alive > SOFT_CRUMBS && i < cr.length; i++) {
      const c = cr[i]!;
      if (c.life >= 1) {
        c.life = 0.999;
        alive--;
      }
    }
    this.crumbs = cr.filter((c) => c.life > 0);
    if (this.crumbs.length > MAX_CRUMBS) this.crumbs.splice(0, this.crumbs.length - MAX_CRUMBS);
  }

  private serve(dt: number, out: BakeEvent[]): void {
    this.grow(dt, out);
    if (this.cookies.every((c) => c.gone)) {
      this.goneT += dt;
      if (this.goneT >= 1) this.enter('sweep');
    }
  }
}
