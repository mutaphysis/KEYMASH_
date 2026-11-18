// PETRI_ renderer: a dark-field microscope. Deep teal water in a round field of view,
// out-of-focus specks drifting at two depths, slow caustic light, translucent glowing organisms.
import type { Cell, Food, Zone, World, SimEvent } from './sim';
import { DISH_R, DIVIDE_TIME, DIVIDE_GAP, TRANSVERSE } from './sim';
import type { GeneId, Species } from './genome';
import { GENE_INDEX, levelOf } from './genome';
import type { Note } from './culture';
import { ctx2d } from '../../ui/dom';
import { LADDER, PixelBudget } from '../../ui/budget';
import { t } from './messages';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const smooth = (a: number, b: number, x: number): number => {
  const u = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};
const BACTERIA = new Set(['bacillus', 'coccus', 'spirillum']);
/** seconds of a death that play out even while the lab is paused: the cell is seen to begin dissolving */
const DEATH_START = 0.9;

/** what a species' genes look like; read once per species (a Species never changes) */
interface Look {
  /** states 0–3 of the level genes drawn by state */
  lobes: number;
  toxic: number;
  armor: number;
  colony: number;
  fertility: number;
  mutation: number;
  wobble: number;
  /** its own movements (beating, wobbling, drifting) run this much faster: ×0.8 … ×1.26 with the speed gene */
  tempo: number;
  symbiosis: boolean;
  spores: boolean;
}
const looks = new WeakMap<Species, Look>();
function lookOf(sp: Species): Look {
  let l = looks.get(sp);
  if (!l) {
    const st = (id: GeneId) => sp.genome[GENE_INDEX[id]] ?? 0;
    l = {
      lobes: st('lobes'),
      toxic: st('toxic'),
      armor: st('armor'),
      colony: st('colony'),
      fertility: st('fertility'),
      mutation: st('mutation'),
      wobble: sp.wobble,
      tempo: Math.cbrt(levelOf('speed', st('speed'))),
      symbiosis: sp.symbiosis,
      spores: sp.spores,
    };
    looks.set(sp, l);
  }
  return l;
}
/** drawn saturation: the sat gene spread wide enough to see, paler for a short life span */
const satOf = (sp: Species): number => (45 + ((sp.sat - 55) * 50) / 30) * (0.7 + (0.3 * (sp.life - 70)) / 70);
/** the mutation gene flickers the second colour: degrees and speed per state */
const MUT_AMP = [0, 14, 28, 50];
const MUT_RATE = [0, 2, 3.5, 6];
/** where inside a body (u along, v across, see `spot`) its food sits, its skulls, and its buds on the rim (angle, radius) */
const DIET_SPOTS: [number, number][] = [
  [0.45, -0.4],
  [-0.35, 0.5],
  [0.55, 0.3],
  [0.1, -0.65],
];
const SKULL_SPOTS: [number, number][] = [
  [0.1, 0.45],
  [-0.45, -0.35],
  [0.62, -0.05],
];
const BUDS: [number, number][][] = [
  [],
  [[2.3, 0.2]],
  [[2.3, 0.28]],
  [
    [2.3, 0.28],
    [-2.2, 0.2],
  ],
];
/** a diatom's shape by its lobes gene: round, boat, triangle, square; sides of the rounded polygon, reach in radii */
const DIATOM_SIDES = [0, 0, 3, 4];
const DIATOM_REACH = [1, 1.5, 1.25, 1.1];

/** how far a body's drawing reaches along its axis, behind and in front, in radii (flagella, mouth and sheath
 * included): a portrait fits all of it into its frame */
function reach(sp: Species): [number, number] {
  const L = lookOf(sp),
    f = sp.flagella;
  let back: number, front: number, rim: number;
  switch (sp.body) {
    case 'amoeba':
      [back, front, rim] = [f ? 2.3 : 1.35, 1.35, 1];
      break;
    case 'bacillus': {
      const l = 1.05 + 0.2 * L.lobes;
      [back, front, rim] = [f ? l + 1.6 : l, sp.diet === 'hunter' ? l * 1.16 : l, l];
      break;
    }
    case 'coccus':
      [back, front, rim] = [f ? 2.4 : 1.1, 1.1, 1];
      break;
    case 'spirillum':
      back = front = f ? 2.45 : 1.7;
      rim = 1.6;
      break;
    case 'diatom':
      // it turns: every direction reaches as far as its longest
      rim = DIATOM_REACH[L.lobes]!;
      back = front = rim + (f ? 1.2 : 0);
      break;
    case 'ciliate':
      [back, front, rim] = [f ? 1.95 : 1.75, 1.75, 1.45];
      break;
    case 'flagellate':
      [back, front, rim] = [1.35, f ? 3.5 : 1.45, 1.35];
      break;
    default:
      [back, front, rim] = [1.05 + 0.12 * f, 1.05 + 0.12 * f, 1];
  }
  const sheath = L.colony ? rim * (1 + 0.12 * L.colony) + 0.08 * L.colony : 0;
  return [Math.max(back, sheath), Math.max(front, sheath)];
}
const SERIF = 'Georgia, "Iowan Old Style", "Times New Roman", serif';
const MONO = '"Share Tech Mono", ui-monospace, monospace';
/** the water and its caustics are soft, so they are drawn this small (pixels per side) and stretched over the dish */
const UNDER = 256;

interface Ripple {
  x: number;
  y: number;
  r0: number;
  r1: number;
  t: number;
  life: number;
  hue: number;
  a: number;
  w: number;
}
interface Frag {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  len: number;
  hue: number;
  t: number;
  life: number;
  dot: boolean;
}
interface Link {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  h1: number;
  h2: number;
  t: number;
  life: number;
}
interface Caption {
  title: string;
  sub: string;
  hue: number;
  t: number;
  life: number;
}
interface Floating {
  text: string;
  x: number;
  y: number;
  hue: number;
  t: number;
  life: number;
}
interface Speck {
  x: number;
  y: number;
  z: number;
  r: number;
  vx: number;
  vy: number;
  a: number;
}

export class MicroRenderer {
  cv: HTMLCanvasElement;
  ctx: Ctx;
  W = 0;
  H = 0;
  dpr = 1;
  /** dish centre and radius in canvas pixels, px per world unit */
  cx = 0;
  cy = 0;
  R = 1;
  k = 1;
  time = 0;
  /** the cells' own clock (beating cilia and flagella, wobble, pulsing): it runs with the dish, so it stops in a pause */
  private life = 0;
  /** when each cell was first drawn (real time): a new cell fades in even while the dish is paused */
  private born = new WeakMap<Cell, number>();
  /** when each cell was first drawn dying (real time): a death's first moments play even while the dish is paused */
  private died = new WeakMap<Cell, number>();
  /** CSS pixels at the bottom of the stage covered by the play buttons */
  reserveBottom = 0;
  gentle = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  ripples: Ripple[] = [];
  frags: Frag[] = [];
  links: Link[] = [];
  floats: Floating[] = [];
  captions: Caption[] = [];
  specks: Speck[] = [];
  // ---- the lab's hands ----
  /** what the pointer is over: a reticle and a glow mark it */
  hover: Cell | Food | null = null;
  /** the hover target has genes to look at: a small helix bubble on the reticle */
  hoverDna = false;
  /** the cell carried by hand: it wiggles; while carried outside the dish (`heldOut`) it is not drawn here */
  held: Cell | null = null;
  heldOut = false;
  /** a stream being aimed: an arrow from where the drag started (a circle while it is short: a swirl) */
  aim: { x0: number; y0: number; x1: number; y1: number } | null = null;
  /** cells poked by hand, seconds since */
  private jiggles = new Map<Cell, number>();
  private hoverOf: Cell | Food | null = null;
  private hoverT = 0;
  private glows = new Map<number, HTMLCanvasElement>();
  private soft: HTMLCanvasElement;
  /** a fast device keeps the full resolution; a slow one steps down to fewer pixels */
  private budget = new PixelBudget([Infinity, ...LADDER]);
  private cssW = 0;
  private cssH = 0;
  /** the water (gradient + caustics), small; redrawn every frame */
  private under = document.createElement('canvas');
  private underCtx = ctx2d(this.under);
  private underBg: CanvasGradient | null = null;
  /** the microscope in front (vignette, rim), drawn once per size of the dish */
  private over = document.createElement('canvas');
  private overCtx = ctx2d(this.over);
  private overKey = '';
  private overX = 0;
  private overY = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.cv = canvas;
    this.ctx = ctx2d(canvas);
    this.soft = this.makeGlow(-1);
    this.reset();
  }

  reset(): void {
    this.ripples = [];
    this.frags = [];
    this.links = [];
    this.floats = [];
    this.captions = [];
    this.specks = [];
    this.hover = this.held = this.aim = null;
    this.heldOut = false;
    this.jiggles.clear();
    for (let i = 0; i < 70; i++)
      this.specks.push(this.speck(Math.random() < 0.82 ? 0.35 + Math.random() * 0.4 : 1.4 + Math.random() * 0.8));
  }

  private speck(z: number): Speck {
    const a = Math.random() * TAU,
      d = Math.sqrt(Math.random()) * DISH_R;
    return {
      x: Math.cos(a) * d,
      y: Math.sin(a) * d,
      z,
      r: z > 1 ? 10 + Math.random() * 22 : 1.2 + Math.random() * 3.5,
      vx: 0,
      vy: 0,
      a: z > 1 ? 0.03 + Math.random() * 0.04 : 0.06 + Math.random() * 0.14,
    };
  }

  resize(cssW: number, cssH: number): void {
    this.cssW = cssW;
    this.cssH = cssH;
    const full = Math.min(window.devicePixelRatio || 1, 1.5);
    const dpr = full * this.budget.scale(cssW * full, cssH * full);
    const W = Math.max(2, Math.round(cssW * dpr)),
      H = Math.max(2, Math.round(cssH * dpr));
    if (W !== this.cv.width || H !== this.cv.height) {
      this.cv.width = W;
      this.cv.height = H;
    }
    this.cv.style.width = cssW + 'px';
    this.cv.style.height = cssH + 'px';
    this.W = W;
    this.H = H;
    this.dpr = dpr;
    const usableH = H - this.reserveBottom * dpr * 0.6;
    this.R = Math.max(10, Math.min(W / 2, usableH / 2) * 0.95);
    this.cx = W / 2;
    this.cy = Math.max(this.R + 6 * dpr, usableH / 2);
    this.k = this.R / DISH_R;
  }

  /** the water: a gradient and slow caustic light, both soft enough to draw small */
  private drawUnder(T: number, activity: number): HTMLCanvasElement {
    const N = Math.max(16, Math.min(UNDER, Math.ceil(this.R * 2)));
    const u = this.under,
      g = this.underCtx;
    if (u.width !== N || !this.underBg) {
      u.width = u.height = N;
      this.underBg = g.createRadialGradient(N / 2, N * 0.4, 0, N / 2, N / 2, N / 2);
      this.underBg.addColorStop(0, '#0d3036');
      this.underBg.addColorStop(0.6, '#072027');
      this.underBg.addColorStop(1, '#03121a');
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.fillStyle = this.underBg;
    g.fillRect(0, 0, N, N);
    // caustics: slow light moving through the water
    const s0 = N / (2 * DISH_R);
    g.setTransform(s0, 0, 0, s0, N / 2, N / 2);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.05 + activity * 0.03;
    for (let i = 0; i < 3; i++) {
      const x = Math.sin(T * 0.05 * (i + 1) + i * 2) * DISH_R * 0.5,
        y = Math.cos(T * 0.037 * (i + 2) + i) * DISH_R * 0.45;
      const s = DISH_R * (0.9 + 0.2 * Math.sin(T * 0.1 + i));
      g.drawImage(this.glow(175 + i * 15), x - s, y - s, s * 2, s * 2);
    }
    return u;
  }

  /** the microscope in front of the dish: vignette and rim, redrawn only when the dish moves or changes size */
  private drawOver(): HTMLCanvasElement {
    const d = this.dpr,
      pad = Math.ceil(4 * d);
    const x0 = Math.floor(this.cx - this.R) - pad,
      y0 = Math.floor(this.cy - this.R) - pad;
    const key = `${this.cx},${this.cy},${this.R},${d}`;
    if (key === this.overKey) return this.over;
    this.overKey = key;
    this.overX = x0;
    this.overY = y0;
    const o = this.over,
      g = this.overCtx;
    o.width = o.height = Math.ceil(this.R * 2) + 2 * pad + 1;
    g.translate(-x0, -y0);
    const vg = g.createRadialGradient(this.cx, this.cy, this.R * 0.72, this.cx, this.cy, this.R);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.75, 'rgba(0,4,6,0.45)');
    vg.addColorStop(1, 'rgba(0,3,5,0.95)');
    g.fillStyle = vg;
    g.beginPath();
    g.arc(this.cx, this.cy, this.R + 1, 0, TAU);
    g.fill();
    g.lineWidth = 1.2 * d;
    g.strokeStyle = 'rgba(150,255,230,0.14)';
    g.beginPath();
    g.arc(this.cx, this.cy, this.R, 0, TAU);
    g.stroke();
    g.strokeStyle = 'rgba(255,150,200,0.05)';
    g.beginPath();
    g.arc(this.cx + 1.5 * d, this.cy, this.R + 2 * d, 0, TAU);
    g.stroke();
    return o;
  }

  /** a soft round light sprite, coloured (hue) or white (-1) */
  private makeGlow(hue: number): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = ctx2d(c);
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    const col = hue < 0 ? '255,255,255' : hslRgb(hue, 85, 62);
    gr.addColorStop(0, `rgba(${col},1)`);
    gr.addColorStop(0.35, `rgba(${col},0.45)`);
    gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return c;
  }
  private glow(hue: number): HTMLCanvasElement {
    const key = (Math.round(hue / 10) * 10) % 360;
    let g = this.glows.get(key);
    if (!g) {
      g = this.makeGlow(key);
      this.glows.set(key, g);
    }
    return g;
  }

  // ---------- events ----------
  handle(ev: SimEvent): void {
    switch (ev.type) {
      case 'spawn':
      case 'hatch':
        this.ripple(ev.x, ev.y, 4, 46, 1.6, ev.sp.hue, 0.5);
        break;
      case 'food':
        if (ev.n >= 3) this.ripple(ev.x, ev.y, 4, 24 + ev.n * 3, 1.4, ev.kind === 'debris' ? 30 : 95, 0.25);
        break;
      case 'eat':
        this.ripple(ev.x, ev.y, ev.size * 0.4, ev.size * 0.9, 0.6, 95, 0.35);
        break;
      case 'touch':
        this.ripple(ev.x, ev.y, 2, ev.size * 0.7, 0.7, ev.a.hue, 0.22);
        break;
      case 'engulf':
        this.ripple(ev.x, ev.y, ev.size * 0.6, ev.size * 1.6, 0.9, ev.pred.hue, 0.6);
        this.burst(ev.x, ev.y, ev.prey.hue, 6, true);
        break;
      case 'divide':
        this.ripple(ev.x, ev.y, ev.size * 0.5, ev.size * 2.2, 1.3, ev.sp.hue, 0.45);
        break;
      case 'die':
        if (ev.cause !== 'eaten') this.burst(ev.x, ev.y, ev.sp.hue, 3, false);
        break; // most of it is the slow dissolve
      case 'bond':
        this.links.push({ ax: ev.ax, ay: ev.ay, bx: ev.bx, by: ev.by, h1: ev.a.hue, h2: ev.b.hue, t: 0, life: 1.8 });
        if (this.links.length > 24) this.links.shift();
        break;
      case 'toxic':
        this.burst(ev.x, ev.y, 80, 8, true);
        break;
      case 'bloom':
        this.ripple(ev.x, ev.y, 10, 90, 2.2, 60, 0.35);
        break;
      case 'zone':
        if (ev.zone.kind !== 'light')
          this.ripple(ev.zone.x, ev.zone.y, 10, ev.zone.r, 2, ev.zone.kind === 'toxin' ? 290 : ev.zone.kind === 'garden' ? 110 : 190, 0.2);
        break;
      case 'first':
        this.introduce(ev.sp);
        break;
      case 'hybrid':
        // the two colours meet in the eater, then the new species is named like any newcomer
        this.ripple(ev.x, ev.y, 4, 60, 1.8, ev.donor.hue, 0.5);
        this.ripple(ev.x, ev.y, 4, 90, 2.4, ev.sp.hue, 0.45);
        this.introduce(ev.sp);
        break;
      case 'mutant':
        this.ripple(ev.x, ev.y, 4, 60, 1.8, ev.from.hue, 0.5);
        this.ripple(ev.x, ev.y, 4, 90, 2.4, ev.sp.hue, 0.45);
        this.introduce(ev.sp);
        break;
      case 'extinct':
        this.captions.push({ title: '† ' + ev.sp.name, sub: t('extinctSub'), hue: ev.sp.hue, t: 0, life: 4.5 });
        break;
    }
    if (this.ripples.length > 60) this.ripples.splice(0, this.ripples.length - 60);
    if (this.frags.length > 160) this.frags.splice(0, this.frags.length - 160);
  }

  introduce(sp: Species): void {
    const traits = [
      t(sp.body),
      t(sp.diet),
      sp.toxic > 0.2 ? t('toxic') : '',
      sp.symbiosis ? t('symbiotic') : '',
      sp.spores ? t('spores') : '',
      sp.colony > 0.6 ? t('colonial') : '',
    ].filter(Boolean);
    this.captions.push({ title: sp.name, sub: traits.join(' · '), hue: sp.hue, t: 0, life: 5 });
  }

  note(n: Note): void {
    this.floats.push({ text: n.text.slice(0, 40), x: n.x, y: n.y, hue: n.hue, t: 0, life: 6 });
    if (this.floats.length > 6) this.floats.shift();
  }

  ripple(x: number, y: number, r0: number, r1: number, life: number, hue: number, a: number): void {
    this.ripples.push({ x, y, r0, r1, t: 0, life, hue, a: this.gentle ? a * 0.6 : a, w: 1.2 });
  }

  private burst(x: number, y: number, hue: number, n: number, dots: boolean): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU,
        s = 6 + Math.random() * 14;
      this.frags.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        rot: Math.random() * TAU,
        vr: (Math.random() - 0.5) * 1.5,
        len: 3 + Math.random() * 6,
        hue,
        t: 0,
        life: 2.5 + Math.random() * 1.5,
        dot: dots,
      });
    }
  }

  // ---------- frame ----------
  /** `pace`: dish seconds per second (the lab's pause and 3×); the water and ripples keep real time */
  frame(dt: number, world: World, activity: number, pace = 1): void {
    // too slow for this many pixels: draw fewer from now on
    if (this.budget.frame(dt) && this.cssW) this.resize(this.cssW, this.cssH);
    dt = Math.min(dt, 0.05);
    this.time += dt;
    this.life += dt * pace;
    const c = this.ctx,
      T = this.time,
      { W, H, k } = this;
    if (!W) return;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.fillStyle = '#010608';
    c.fillRect(0, 0, W, H);

    // --- the dish: world coordinates from here on
    c.save();
    c.beginPath();
    c.arc(this.cx, this.cy, this.R, 0, TAU);
    c.clip();
    c.drawImage(this.drawUnder(T, activity), this.cx - this.R, this.cy - this.R, this.R * 2, this.R * 2);
    c.setTransform(k, 0, 0, k, this.cx, this.cy);
    c.globalCompositeOperation = 'lighter';
    // zones
    for (const z of world.zones) this.drawZone(c, z, world.time);
    // spores
    for (const s of world.spores) {
      const p = 0.6 + 0.4 * Math.sin(T * 3 + s.x);
      c.globalAlpha = 0.5 * p;
      c.drawImage(this.glow(s.hue), s.x - 7, s.y - 7, 14, 14);
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';

    // far specks (behind everything)
    this.drawSpecks(c, world, dt, false);
    // food
    for (const f of world.food) this.drawFood(c, f);
    // links between symbionts
    c.globalCompositeOperation = 'lighter';
    for (const l of this.links) {
      l.t += dt;
      const a = Math.sin(Math.min(1, l.t / l.life) * Math.PI) * 0.5;
      const g = c.createLinearGradient(l.ax, l.ay, l.bx, l.by);
      g.addColorStop(0, `hsla(${l.h1},90%,70%,${a})`);
      g.addColorStop(1, `hsla(${l.h2},90%,70%,${a})`);
      c.strokeStyle = g;
      c.lineWidth = (2.2 / k) * this.dpr;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(l.ax, l.ay);
      c.quadraticCurveTo((l.ax + l.bx) / 2 + 10, (l.ay + l.by) / 2 - 10, l.bx, l.by);
      c.stroke();
    }
    this.links = this.links.filter((l) => l.t < l.life);
    c.globalCompositeOperation = 'source-over';
    // organisms: prey being digested first, so they appear inside their predator
    for (const cell of world.cells) if (cell.state === 'eaten') this.drawCell(c, cell);
    for (const cell of world.cells) if (cell.state !== 'eaten') this.drawCell(c, cell);
    this.drawHands(c, dt);
    // ripples and fragments
    for (const r of this.ripples) {
      r.t += dt;
      const p = r.t / r.life;
      if (p >= 1) continue;
      c.strokeStyle = `hsla(${r.hue},80%,75%,${r.a * (1 - p) * (1 - p)})`;
      c.lineWidth = (r.w / k) * this.dpr;
      c.beginPath();
      c.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * (1 - (1 - p) * (1 - p)), 0, TAU);
      c.stroke();
    }
    this.ripples = this.ripples.filter((r) => r.t < r.life);
    for (const f of this.frags) {
      f.t += dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vx *= Math.pow(0.4, dt);
      f.vy *= Math.pow(0.4, dt);
      f.rot += f.vr * dt;
      const a = 0.6 * (1 - f.t / f.life);
      if (f.dot) {
        c.fillStyle = `hsla(${f.hue},70%,70%,${a})`;
        c.beginPath();
        c.arc(f.x, f.y, 1.4, 0, TAU);
        c.fill();
      } else {
        c.strokeStyle = `hsla(${f.hue},50%,72%,${a})`;
        c.lineWidth = (1.2 / k) * this.dpr;
        c.beginPath();
        c.arc(f.x, f.y, f.len, f.rot, f.rot + 1.1);
        c.stroke();
      }
    }
    this.frags = this.frags.filter((f) => f.t < f.life);
    // notes from the code (quotes, sums), written into the water
    for (const n of this.floats) {
      n.t += dt;
      const a = Math.min(1, n.t * 1.5, (n.life - n.t) * 0.8);
      c.save();
      c.translate(n.x, n.y - n.t * 4);
      c.scale(1 / k, 1 / k);
      c.font = `italic ${15 * this.dpr}px ${SERIF}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = `hsla(${n.hue},60%,82%,${a * 0.85})`;
      c.fillText(n.text, 0, 0);
      c.restore();
    }
    this.floats = this.floats.filter((n) => n.t < n.life);
    // near specks: big, soft, in front, out of focus
    this.drawSpecks(c, world, dt, true);
    c.restore();

    // --- microscope: vignette, rim, labels (canvas pixels)
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(this.drawOver(), this.overX, this.overY);
    this.drawScale(c);
    this.drawCaption(c, dt);
  }

  private drawZone(c: Ctx, z: Zone, now: number): void {
    const fade = Math.max(0, Math.min(1, (z.until - now) / 3, (now - z.t0) / 1.5));
    if (fade <= 0) return;
    const r = z.r * (z.kind === 'light' ? 1.3 : 1.1);
    if (z.kind === 'light') {
      c.globalAlpha = 0.22 * fade;
      c.drawImage(this.glow(48), z.x - r, z.y - r, r * 2, r * 2);
    } else if (z.kind === 'toxin') {
      c.globalAlpha = 0.16 * fade;
      c.drawImage(this.glow(290), z.x - r, z.y - r, r * 2, r * 2);
    } else if (z.kind === 'garden') {
      c.globalAlpha = 0.12 * fade;
      c.drawImage(this.glow(115), z.x - r, z.y - r, r * 2, r * 2);
    } else if (z.kind === 'current') {
      c.globalAlpha = 1;
      c.lineWidth = (1 / this.k) * this.dpr;
      c.lineCap = 'round';
      c.strokeStyle = `hsla(190,70%,75%,${0.07 * fade})`;
      c.beginPath();
      for (let i = 0; i < 4; i++) {
        const rr = z.r * (0.3 + i * 0.18),
          a0 = this.time * 0.6 * (z.swirl || 1) + i * 1.7;
        if (z.swirl) {
          c.moveTo(z.x + Math.cos(a0) * rr, z.y + Math.sin(a0) * rr);
          c.arc(z.x, z.y, rr, a0, a0 + 1.6);
        } else {
          const ca = Math.cos(z.angle),
            sa = Math.sin(z.angle),
            off = ((this.time * 30 + i * 40) % (z.r * 1.6)) - z.r * 0.8,
            side = (i - 1.5) * 26;
          c.moveTo(z.x + ca * off - sa * side, z.y + sa * off + ca * side);
          c.lineTo(z.x + ca * (off + 40) - sa * side, z.y + sa * (off + 40) + ca * side);
        }
      }
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  private drawSpecks(c: Ctx, world: World, dt: number, near: boolean): void {
    c.globalCompositeOperation = 'lighter';
    for (const s of this.specks) {
      if (s.z > 1 !== near) continue;
      // drift with the currents, a little faster the closer they are
      let fx = 0,
        fy = 0;
      for (const z of world.zones) {
        if (z.kind !== 'current') continue;
        const dx = s.x - z.x,
          dy = s.y - z.y,
          d = Math.hypot(dx, dy);
        if (d > z.r) continue;
        const kk = 1 - d / z.r;
        if (z.swirl) {
          fx += (-dy / (d + 1)) * z.swirl * 30 * kk;
          fy += (dx / (d + 1)) * z.swirl * 30 * kk;
        } else {
          fx += Math.cos(z.angle) * 30 * kk;
          fy += Math.sin(z.angle) * 30 * kk;
        }
      }
      s.vx += ((Math.random() - 0.5) * 8 + fx - s.vx) * dt * 0.8;
      s.vy += ((Math.random() - 0.5) * 8 + fy - s.vy) * dt * 0.8;
      s.x += s.vx * dt * s.z;
      s.y += s.vy * dt * s.z;
      if (Math.hypot(s.x, s.y) > DISH_R + 30) {
        const a = Math.atan2(s.y, s.x) + Math.PI;
        s.x = Math.cos(a) * DISH_R * 0.95;
        s.y = Math.sin(a) * DISH_R * 0.95;
      }
      c.globalAlpha = s.a;
      c.drawImage(this.soft, s.x - s.r * 2, s.y - s.r * 2, s.r * 4, s.r * 4);
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }

  private drawFood(c: Ctx, f: Food): void {
    const s = 0.5 + 0.5 * Math.sqrt(Math.max(0, f.e / f.e0));
    const fade = Math.min(1, f.age * 2, (f.life - f.age) / 3);
    switch (f.kind) {
      case 'algae':
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = 0.35 * fade;
        c.drawImage(this.glow(100), f.x - 8 * s, f.y - 8 * s, 16 * s, 16 * s);
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'source-over';
        c.fillStyle = `hsla(96,65%,58%,${0.85 * fade})`;
        c.beginPath();
        c.arc(f.x, f.y, 2.4 * s, 0, TAU);
        c.fill();
        break;
      case 'crumb':
        c.fillStyle = `hsla(42,45%,72%,${0.7 * fade})`;
        c.beginPath();
        c.arc(f.x, f.y, 1.8 * s, 0, TAU);
        c.fill();
        break;
      case 'sugar': {
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = 0.5 * fade;
        c.drawImage(this.glow(50), f.x - 12 * s, f.y - 12 * s, 24 * s, 24 * s);
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'source-over';
        c.save();
        c.translate(f.x, f.y);
        c.rotate(f.spin);
        c.fillStyle = `hsla(50,80%,88%,${0.9 * fade})`;
        c.fillRect(-2.6 * s, -2.6 * s, 5.2 * s, 5.2 * s);
        c.restore();
        break;
      }
      case 'debris': {
        c.save();
        c.translate(f.x, f.y);
        c.rotate(f.spin);
        c.fillStyle = `hsla(28,18%,48%,${0.55 * fade})`;
        c.beginPath();
        c.moveTo(-3 * s, -1 * s);
        c.lineTo(1 * s, -2.4 * s);
        c.lineTo(3 * s, 1 * s);
        c.lineTo(-1 * s, 2.2 * s);
        c.closePath();
        c.fill();
        c.restore();
        break;
      }
    }
  }

  // ---------- organisms ----------
  private drawCell(c: Ctx, cell: Cell): void {
    if (cell === this.held && this.heldOut) return;
    const sp = cell.sp,
      T = this.life;
    let born = this.born.get(cell);
    if (born === undefined) this.born.set(cell, (born = this.time));
    let alpha = Math.min(1, Math.max(cell.age, this.time - born) * 2 + (cell.gen > 1 ? 1 : 0));
    // dying: the membrane dissolves first, the remains fade after. In a pause (cell.t stands still) the first
    // DEATH_START seconds still play, then it waits; at 1× real time and cell.t run alike, so nothing jumps
    let t = cell.t;
    if (cell.state === 'dying') {
      let died = this.died.get(cell);
      if (died === undefined) this.died.set(cell, (died = this.time));
      t = Math.max(t, Math.min(DEATH_START, this.time - died));
    }
    const dis = cell.state === 'dying' ? Math.min(1, t / 2.6) : 0;
    if (dis) alpha *= 1 - smooth(0.55, 1, dis);
    if (cell.state === 'eaten') alpha *= Math.max(0, 1 - cell.t / 1.5) * 0.8;
    // set only for a cell that is drawn: one left out must not leave the next drawing (a lab portrait) dissolved
    if (alpha <= 0.01) return;
    this.dis = dis;
    const sick = cell.sick > 0;
    const hue = sick ? 72 : cell.shownHue,
      sat = (sick ? 30 : satOf(sp)) * (1 - 0.75 * smooth(0, 0.4, this.dis));
    const R = Math.max(1.5, cell.r);
    const k = this.k,
      px = this.dpr / k;

    // glow halo
    if (sp.glow > 0.12 && cell.state !== 'eaten') {
      const p = 0.65 + 0.35 * Math.sin(T * 1.8 + cell.seed);
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = Math.min(0.6, sp.glow * 0.55) * p * alpha;
      const g = R * (3 + sp.glow * 2);
      c.drawImage(this.glow(hue), cell.x - g, cell.y - g, g * 2, g * 2);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
    }

    c.save();
    c.translate(cell.x + (sick ? Math.sin(T * 40 + cell.seed) * 0.6 : 0), cell.y);
    if (cell === this.held) {
      // in the hand: it wriggles (in real time: the hand moves it even in a pause)
      c.rotate((this.gentle ? 0.06 : 0.18) * Math.sin(this.time * 10));
      c.scale(1.12, 1.12);
    }
    const jt = this.jiggles.get(cell);
    if (jt !== undefined) {
      // poked: a wobble that dies away
      const a = 0.14 * Math.exp(-4 * jt) * (this.gentle ? 0.4 : 1) * Math.sin(28 * jt);
      c.scale(1 + a, 1 - a);
    }
    c.globalAlpha = alpha;
    if (cell.state === 'dividing') {
      // crossfade in and out of the division drawing, so neither the start (the cell rounds up)
      // nor the end (two daughters with their own shapes) jumps
      const p = Math.min(1, cell.t / DIVIDE_TIME),
        base = c.globalAlpha;
      const fin = smooth(0, 0.14, p),
        fout = smooth(0.82, 1, p);
      if (fin < 1) {
        c.save();
        c.rotate(cell.heading);
        c.globalAlpha = base * (1 - fin);
        this.body(c, cell, sp, R, hue, sat, px, T + (cell.seed % 1000));
        c.restore();
      }
      if (fin * (1 - fout) > 0.01) {
        c.save();
        c.rotate(cell.axis);
        c.globalAlpha = base * fin * (1 - fout);
        this.dividing(c, cell, sp, R, hue, sat, px, T + (cell.seed % 1000));
        c.restore();
      }
      if (fout > 0) {
        // the daughters exactly as the simulation will place them: ±DIVIDE_GAP·R along the axis, radius 0.78·R
        const end = R * DIVIDE_GAP,
          r = R * 0.78;
        const daughters: [number, number, number][] = [
          [1, cell.seed, cell.heading],
          [-1, cell.childSeed, cell.heading + (TRANSVERSE.has(sp.body) ? 0 : Math.PI)],
        ];
        for (const [sgn, seed, head] of daughters) {
          c.save();
          c.translate(Math.cos(cell.axis) * end * sgn, Math.sin(cell.axis) * end * sgn);
          c.rotate(head);
          c.globalAlpha = base * fout;
          this.body(c, { seed, vx: 0, vy: 0 }, sp, r, hue, sat, px, T + (seed % 1000));
          c.restore();
        }
      }
    } else {
      c.rotate(cell.heading);
      if (this.dis) {
        const sw = 1 + 0.2 * smooth(0.1, 0.7, this.dis);
        c.scale(sw, sw);
      } // lysis: the cell swells
      this.body(c, cell, sp, R, hue, sat, px, T + (cell.seed % 1000));
    }
    c.restore();
    this.dis = 0;
    if (cell.state === 'eaten') {
      // the food vacuole around the prey
      c.strokeStyle = `rgba(220,240,255,${0.3 * alpha})`;
      c.lineWidth = 1 * px;
      c.beginPath();
      c.arc(cell.x, cell.y, R * 1.25, 0, TAU);
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  /**
   * One continuous membrane that elongates and then pinches at a cleavage furrow. Inside:
   * mitosis for cells with a nucleus (chromosomes line up, are pulled apart, two nuclei form),
   * binary fission for bacteria (the DNA doubles and a wall grows in from the middle).
   * Local x is the division axis; the daughters end at ±DIVIDE_GAP·R.
   */
  private dividing(c: Ctx, cell: Cell, sp: Species, R: number, hue: number, sat: number, px: number, t: number): void {
    const p = Math.min(1, cell.t / DIVIDE_TIME);
    const t0 = t;
    t = this.enter(sp, t);
    const bact = BACTERIA.has(sp.body);
    const e = smooth(0, 0.45, p),
      pinch = smooth(bact ? 0.45 : 0.35, 0.98, p);
    const end = R * DIVIDE_GAP; // where the daughters' centres end up
    // shells and spirals: each daughter takes half, so draw two copies sliding apart
    if (sp.body === 'diatom' || sp.body === 'spirillum') {
      for (const s of [-1, 1]) {
        c.save();
        c.translate(s * end * e, 0);
        c.rotate(cell.heading - cell.axis);
        c.scale(0.85, 0.85);
        this.body(c, cell, sp, R, hue, sat, px, t0);
        c.restore();
      }
      return;
    }
    // membrane: ellipse (or rounded rod) stretched along the axis, pinched at the waist
    const A = sp.body === 'bacillus' ? R * 1.25 * (1 + 0.95 * e) : R * (1 + 0.62 * e);
    const B = sp.body === 'bacillus' ? R * 0.52 : R * (1 - 0.16 * e);
    const nPow = sp.body === 'bacillus' ? 4 : 2; // superellipse: 4 = rod with rounded ends
    const n = 64;
    c.beginPath();
    for (let i = 0; i <= n; i++) {
      const th = (i / n) * TAU,
        co = Math.cos(th),
        si = Math.sin(th);
      let r = Math.pow(Math.pow(Math.abs(co / A), nPow) + Math.pow(Math.abs(si / B), nPow), -1 / nPow);
      r *= 1 - pinch * (bact ? 0.75 : 0.93) * Math.exp(-(co * co) / 0.05); // cleavage furrow
      if (sp.body === 'amoeba') r *= 1 + 0.05 * Math.sin(3 * th + t);
      const x = co * r,
        y = si * r;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.closePath();
    this.skin(c, hue, sat, px, R);
    if (sp.cilia) {
      // cilia keep beating around the dividing body
      c.strokeStyle = `hsla(${hue},55%,82%,0.45)`;
      c.lineWidth = 0.8 * px;
      c.beginPath(); // one path for all of them: a stroke per cilium is what made ciliates slow to draw
      for (let i = 0; i < 40; i++) {
        const th = (i / 40) * TAU,
          co = Math.cos(th),
          si = Math.sin(th);
        const r =
          Math.pow(Math.pow(Math.abs(co / A), 2) + Math.pow(Math.abs(si / B), 2), -0.5) * (1 - pinch * 0.93 * Math.exp(-(co * co) / 0.05));
        const b = th + Math.sin(t * 9 - i * 0.55) * 0.5;
        c.moveTo(co * r, si * r);
        c.lineTo(co * r + Math.cos(b) * R * 0.25, si * r + Math.sin(b) * R * 0.25);
      }
      c.stroke();
    }
    // cytoplasm and organelles: half go to each side
    const part = smooth(0.25, 0.9, p);
    if (!bact)
      for (const s of [-1, 1]) {
        c.save();
        c.translate(s * end * part, 0);
        c.scale(0.8, 0.8);
        this.organelles(c, sp, R, t * 0.5 + s, 0.45);
        c.restore();
      }
    if (bact) {
      // binary fission: the nucleoid doubles and separates, a septum grows inward
      const sep = smooth(0.1, 0.6, p);
      c.strokeStyle = `hsla(${this.h2},50%,78%,0.45)`;
      c.lineWidth = 0.8 * px;
      c.beginPath();
      for (const s of [-1, 1])
        for (let i = 0; i <= 8; i++) {
          const x = s * end * sep + (i / 8 - 0.5) * R * 0.6,
            y = Math.sin(i * 1.9 + s) * B * 0.3;
          i ? c.lineTo(x, y) : c.moveTo(x, y);
        }
      c.stroke();
      const wall = smooth(0.4, 0.92, p);
      if (wall > 0) {
        c.strokeStyle = `hsla(${hue},${sat}%,82%,0.7)`;
        c.lineWidth = 1.1 * px;
        c.beginPath();
        c.moveTo(0, -B);
        c.lineTo(0, -B * (1 - wall));
        c.moveTo(0, B);
        c.lineTo(0, B * (1 - wall));
        c.stroke();
      }
      return;
    }
    // mitosis
    const env = 1 - smooth(0.15, 0.28, p); // the nuclear envelope dissolves …
    if (env > 0.01) {
      c.save();
      c.globalAlpha *= env;
      c.fillStyle = `hsla(${this.h2},45%,32%,0.55)`;
      c.beginPath();
      c.arc(0, 0, R * (0.3 + 0.06 * smooth(0, 0.15, p)), 0, TAU);
      c.fill();
      c.strokeStyle = `hsla(${this.h2},60%,72%,0.5)`;
      c.lineWidth = 0.8 * px;
      c.stroke();
      c.restore();
    }
    const chrom = smooth(0.18, 0.3, p) * (1 - smooth(0.72, 0.85, p));
    if (chrom > 0.01) {
      const pull = smooth(0.48, 0.72, p) * end * 0.9; // … chromosomes line up, then are pulled to the poles
      const align = smooth(0.25, 0.45, p);
      // spindle fibres
      c.strokeStyle = `hsla(${this.h2},40%,85%,${0.22 * chrom})`;
      c.lineWidth = 0.6 * px;
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const y = (i / 5 - 0.5) * B * 0.9;
        for (const s of [-1, 1]) {
          c.moveTo(s * end * 0.95, 0);
          c.lineTo(s * Math.max(pull, 1), y * 0.7);
        }
      }
      c.stroke();
      c.strokeStyle = `hsla(${this.h2},75%,80%,${0.9 * chrom})`;
      c.lineWidth = 1.8 * px;
      c.lineCap = 'round';
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const y = (i / 5 - 0.5) * B * 0.8 * (1 - 0.3 * smooth(0.48, 0.72, p));
        const x0 = Math.sin(i * 2.3 + cell.seed) * R * 0.25 * (1 - align);
        const a0 = Math.sin(i * 1.7) * 1.2 * (1 - align) + (Math.PI / 2) * align; // turn upright on the plate
        const L = R * 0.16;
        for (const s of pull > 0.5 ? [-1, 1] : [0]) {
          const x = x0 + s * pull;
          c.moveTo(x - (Math.cos(a0) * L) / 2, y - (Math.sin(a0) * L) / 2);
          c.lineTo(x + (Math.cos(a0) * L) / 2, y + (Math.sin(a0) * L) / 2);
        }
      }
      c.stroke();
    }
    const reform = smooth(0.74, 0.95, p); // two new nuclei
    if (reform > 0.01) {
      for (const s of [-1, 1]) {
        c.save();
        c.globalAlpha *= reform;
        c.fillStyle = `hsla(${this.h2},45%,32%,0.55)`;
        c.beginPath();
        c.arc(s * end * 0.9, 0, R * 0.24 * (0.6 + 0.4 * reform), 0, TAU);
        c.fill();
        c.strokeStyle = `hsla(${this.h2},60%,72%,0.5)`;
        c.lineWidth = 0.8 * px;
        c.stroke();
        c.restore();
      }
    }
  }

  private blob(c: Ctx, R: number, wob: number, lobes: number, seed: number, t: number, sx = 1, sy = 1, taper = 0): void {
    const n = 28;
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      let rr = R * (1 + wob * (0.11 * Math.sin(lobes * a + t * 0.8 + seed) + 0.06 * Math.sin((lobes + 2) * a - t * 1.3 + seed * 2)));
      rr *= 1 - taper * Math.max(0, -Math.cos(a));
      pts.push([Math.cos(a) * rr * sx, Math.sin(a) * rr * sy]);
    }
    c.beginPath();
    const m = (i: number): [number, number] => {
      const p = pts[i % n]!,
        q = pts[(i + 1) % n]!;
      return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    };
    const s0 = m(n - 1);
    c.moveTo(s0[0], s0[1]);
    for (let i = 0; i < n; i++) {
      const p = pts[i]!,
        q = m(i);
      c.quadraticCurveTo(p[0], p[1], q[0], q[1]);
    }
    c.closePath();
  }

  /** 0..1 while the cell being drawn is dying */
  private dis = 0;
  /** the looks of the species being drawn (set by `enter`), its second colour as drawn (mutation flickers it) */
  private look: Look | null = null;
  private h2 = 0;
  /** the body being drawn: its outline as an ellipse (A, B), its inside (ia, ib), how big what it carries is drawn
   * (`ink`); a spirillum's wave and a bending rod shift all of it by yAt(x) */
  private fA = 1;
  private fB = 1;
  private ia = 1;
  private ib = 1;
  private ink = 1;
  private taper = 0;
  private curve: 'none' | 'wave' | 'bend' = 'none';
  private cAmp = 0;
  private cFreq = 0;
  private cPhase = 0;

  /** a species' looks for this draw; returns its clock, sped up by its speed gene */
  private enter(sp: Species, t: number): number {
    const L = (this.look = lookOf(sp));
    t *= L.tempo;
    const a = MUT_AMP[L.mutation]!,
      f = MUT_RATE[L.mutation]!;
    this.h2 = (sp.hue2 + a * (0.6 * Math.sin(t * f) + 0.4 * Math.sin(t * f * 2.3 + 1)) + 360) % 360;
    return t;
  }

  private yAt(x: number): number {
    if (this.curve === 'wave') return Math.sin(((x + this.fA) / (2 * this.fA)) * Math.PI * this.cFreq + this.cPhase) * this.cAmp;
    if (this.curve === 'bend') return this.cAmp * (1 - (x / this.fA) ** 2);
    return 0;
  }
  /** a point inside the body: u along it, v across, both -1..1 (contents drift out when the membrane goes) */
  private spot(u: number, v: number): [number, number] {
    const s = 1 + 1.2 * this.dis,
      x = u * this.ia * s;
    return [x, v * this.ib * s + this.yAt(x)];
  }
  /** a point on the outline at angle th, and its outward normal */
  private edge(th: number): [number, number, number, number] {
    const co = Math.cos(th),
      si = Math.sin(th);
    // a flagellate narrows toward its back
    const tp = 1 - this.taper * Math.max(0, -co);
    const x = co * this.fA * tp,
      nx = co / this.fA,
      ny = si / this.fB,
      nl = Math.hypot(nx, ny);
    return [x, si * this.fB * tp + this.yAt(x), nx / nl, ny / nl];
  }

  private skin(c: Ctx, hue: number, sat: number, px: number, R: number, a = 1): void {
    const d = this.dis;
    c.fillStyle = `hsla(${hue},${sat}%,52%,${0.2 * a * (1 - d)})`;
    c.fill();
    if (d > 0) {
      // the membrane breaks into ever shorter pieces with growing gaps
      c.setLineDash([Math.max(0.6, 9 * (1 - d)) * px, (1 + 10 * d) * px]);
      c.lineDashOffset = d * 20 * px;
    }
    c.strokeStyle = `hsla(${hue},${sat}%,78%,${0.8 * a * (1 - 0.6 * d)})`;
    c.lineWidth = 1.4 * px;
    c.stroke();
    if (d > 0) c.setLineDash([]);
    this.armour(c, hue, sat, R, a);
  }

  /** the armour gene on the wall (the current path): a thick wall, then plates on it, then studs between them;
   * `under` is the width of a wall drawn as a stroke (a spirillum's) */
  private armour(c: Ctx, hue: number, sat: number, R: number, a = 1, under = 0): void {
    const st = this.look?.armor ?? 0;
    if (!st) return;
    a *= 1 - this.dis;
    // plates across a wall drawn as a stroke cover all of it: fainter there
    const p = under ? 0.45 : 1;
    c.lineCap = 'butt';
    c.strokeStyle = `hsla(${hue},${sat * 0.5}%,80%,${0.2 * a})`;
    c.lineWidth = under + R * 0.14;
    c.stroke();
    if (st >= 2) {
      c.setLineDash([R * 0.34, R * 0.1]);
      c.strokeStyle = `hsla(${hue},${sat * 0.5}%,84%,${0.4 * a * p})`;
      c.lineWidth = under + R * 0.1;
      c.stroke();
    }
    if (st >= 3) {
      c.setLineDash([0, R * 0.44]);
      c.lineDashOffset = -R * 0.39;
      c.lineCap = 'round';
      c.strokeStyle = `hsla(${hue},${sat * 0.4}%,92%,${0.8 * a * p})`;
      c.lineWidth = under + R * 0.15;
      c.stroke();
      c.lineDashOffset = 0;
    }
    c.setLineDash([]);
    c.lineCap = 'round';
  }

  private nucleus(c: Ctx, R: number, px: number, x = -0.15, y = 0.08): void {
    if (this.dis) {
      R *= 1 - 0.5 * this.dis;
      c.globalAlpha *= 1 - this.dis;
    }
    const h2 = this.h2;
    c.fillStyle = `hsla(${h2},45%,32%,0.55)`;
    c.beginPath();
    c.arc(R * x, R * y, R * 0.3, 0, TAU);
    c.fill();
    c.strokeStyle = `hsla(${h2},60%,72%,0.45)`;
    c.lineWidth = 0.8 * px;
    c.stroke();
    c.fillStyle = `hsla(${h2},70%,82%,0.8)`;
    c.beginPath();
    c.arc(R * (x + 0.06), R * (y - 0.05), R * 0.08, 0, TAU);
    c.fill();
  }

  private organelles(c: Ctx, sp: Species, R: number, t: number, spread = 0.55): void {
    for (let i = 0; i < sp.organelles; i++) {
      const a = i * 2.4 + t * 0.25 * (i % 2 ? 1 : -1),
        d = R * spread * (1 + 2.2 * this.dis) * (0.45 + (0.55 * ((i * 37) % 10)) / 10); // contents drift out when the membrane goes
      c.fillStyle = `hsla(${(sp.hue + 30) % 360},70%,72%,0.55)`;
      c.beginPath();
      c.ellipse(Math.cos(a) * d, Math.sin(a) * d, R * 0.1, R * 0.055, a, 0, TAU);
      c.fill();
    }
  }

  /** what bacteria and diatoms have instead of organelles: n small round granules (oil drops in a diatom) */
  private granules(c: Ctx, n: number, R: number, t: number, fill: string): void {
    c.fillStyle = fill;
    c.beginPath();
    const r = R * 0.09 * this.ink;
    for (let i = 0; i < n; i++) {
      const [x, y] = this.spot(-0.75 + (1.5 * (i + 0.5)) / n, Math.sin(i * 2.7 + t * 0.2) * 0.55);
      c.moveTo(x + r, y);
      c.arc(x, y, r, 0, TAU);
    }
    c.fill();
  }

  private mouth(c: Ctx, R: number, hue: number, px: number): void {
    c.strokeStyle = `hsla(${hue},80%,80%,0.7)`;
    c.lineWidth = 1.1 * px;
    c.beginPath();
    for (const s of [-0.35, 0, 0.35]) {
      c.moveTo(R * 0.92, R * s * 0.8);
      c.lineTo(R * 1.22, R * s);
    }
    c.stroke();
  }

  /** from x0, y0 (on the body's edge) along the axis, away from the body in `dir` */
  private flagellum(c: Ctx, x0: number, len: number, amp: number, t: number, hue: number, px: number, dir = -1, y0 = 0): void {
    c.strokeStyle = `hsla(${hue},60%,80%,${0.6 * (1 - this.dis)})`;
    c.lineWidth = 1 * px;
    c.lineCap = 'round';
    c.beginPath();
    for (let i = 0; i <= 16; i++) {
      const s = i / 16;
      const x = x0 + dir * s * len,
        y = y0 + Math.sin(t * 12 * (1 - this.dis) - s * 9) * amp * s;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.stroke();
  }

  /** n flagella fanned out from x0, y0 */
  private whips(
    c: Ctx,
    n: number,
    x0: number,
    y0: number,
    len: number,
    amp: number,
    t: number,
    hue: number,
    px: number,
    dir = -1,
    fan = 0.45,
  ): void {
    for (let i = 0; i < n; i++) {
      c.save();
      c.translate(x0, y0);
      c.rotate((i - (n - 1) / 2) * fan);
      this.flagellum(c, 0, len, amp, t + i * 0.7, hue, px, dir);
      c.restore();
    }
  }

  /** the outline and inside of the body about to be drawn (see fA … cPhase); a diatom turns here, so all it carries turns along */
  private shape(c: Ctx, sp: Species, L: Look, R: number, t: number, seed: number): void {
    const set = (A: number, B: number, ia: number, ib: number, ink = 1) => {
      this.fA = A;
      this.fB = B;
      this.ia = ia;
      this.ib = ib;
      this.ink = ink;
    };
    this.curve = 'none';
    this.taper = 0;
    this.cAmp = 0;
    switch (sp.body) {
      case 'bacillus': {
        const A = R * (1.05 + 0.2 * L.lobes),
          B = R * 0.52;
        set(A, B, A * 0.7, B * 0.5, 0.75);
        this.curve = 'bend';
        this.cAmp = R * 0.3 * L.wobble * Math.sin(t * 1.3 + seed);
        break;
      }
      case 'spirillum':
        set(R * 1.6, R * 0.21, R * 1.3, R * 0.1, 0.8);
        this.curve = 'wave';
        this.cAmp = R * (0.22 + 0.3 * L.wobble);
        this.cFreq = L.lobes + 2;
        this.cPhase = t * 7;
        break;
      case 'diatom': {
        // glass does not wobble: a wobblier diatom rocks more as it turns
        c.rotate(t * 0.05 + L.wobble * 0.4 * Math.sin(t * 0.9 + seed));
        const e = DIATOM_REACH[L.lobes]!;
        if (L.lobes === 1) set(R * 1.5, R * 0.55, R, R * 0.3, 0.8);
        else set(R * e, R * e, R * 0.55, R * 0.55);
        break;
      }
      case 'ciliate': {
        const sq = L.wobble * 0.07 * Math.sin(t * 2.2 + seed);
        const A = R * 1.45 * (1 + sq),
          B = R * (0.65 + 0.2 * L.lobes) * (1 - sq);
        set(A, B, A * 0.75, B * 0.6);
        break;
      }
      case 'flagellate':
        set(R * 1.35, R * 0.85, R * 0.9, R * 0.5);
        this.taper = 0.35;
        break;
      default:
        set(R, R, R * 0.6, R * 0.6);
    }
  }

  /** the colony gene: a mucus sheath, behind the body */
  private sheath(c: Ctx, L: Look, R: number, hue: number, sat: number, px: number): void {
    if (!L.colony) return;
    const g = 1 + 0.12 * L.colony,
      e = R * 0.08 * L.colony;
    const a = 1 - this.dis;
    c.beginPath();
    c.ellipse(0, this.curve === 'bend' ? this.cAmp * 0.6 : 0, this.fA * g + e, (this.fB + Math.abs(this.cAmp)) * g + e, 0, 0, TAU);
    c.fillStyle = `hsla(${hue},${sat * 0.5}%,70%,${(0.04 + 0.025 * L.colony) * a})`;
    c.fill();
    c.setLineDash([2 * px, 3 * px]);
    c.strokeStyle = `hsla(${hue},${sat * 0.4}%,82%,${0.2 * a})`;
    c.lineWidth = 0.8 * px;
    c.stroke();
    c.setLineDash([]);
  }

  /** what every body carries, as its genes say: food it lives on, poison, a spore sac, buds, partners */
  private carried(c: Ctx, sp: Species, L: Look, R: number, hue: number, sat: number, px: number, t: number): void {
    const a0 = c.globalAlpha,
      fade = 1 - this.dis;
    // thin bodies draw their contents smaller, but not so small that a skull or spore sac can't be made out
    const s = R * Math.max(this.ink, 0.9);
    // diet: chloroplasts (the diatom has its own golden ones), food vacuoles, digestive vacuoles
    const d = sp.diet;
    let at = 0;
    const next = (): [number, number] => {
      const p = DIET_SPOTS[at++ % DIET_SPOTS.length]!;
      return this.spot(p[0] + 0.06 * Math.sin(t * 0.35 + at), p[1] + 0.06 * Math.cos(t * 0.3 + at * 2));
    };
    if ((d === 'photo' || d === 'omni') && sp.body !== 'diatom') {
      c.fillStyle = `hsla(108,60%,46%,${0.6 * fade})`;
      for (let i = 0; i < (d === 'photo' ? 3 : 2); i++) {
        const [x, y] = next();
        c.beginPath();
        c.ellipse(x, y, s * 0.17, s * 0.09, i * 1.3 + t * 0.05, 0, TAU);
        c.fill();
      }
    } else if (d === 'omni') at = 2;
    if (d === 'grazer' || d === 'omni') {
      for (let i = 0; i < 2; i++) {
        const [x, y] = next();
        c.beginPath();
        c.arc(x, y, s * 0.12, 0, TAU);
        c.fillStyle = `rgba(200,230,210,${0.08 * fade})`;
        c.fill();
        c.strokeStyle = `rgba(225,240,230,${0.45 * fade})`;
        c.lineWidth = 0.8 * px;
        c.stroke();
        c.fillStyle = `hsla(95,55%,62%,${0.6 * fade})`;
        c.beginPath();
        c.arc(x + s * 0.03, y - s * 0.02, s * 0.04, 0, TAU);
        c.fill();
      }
    }
    if (d === 'hunter') {
      for (let i = 0; i < 2; i++) {
        const [x, y] = next();
        c.beginPath();
        c.arc(x, y, s * 0.13, 0, TAU);
        c.fillStyle = `hsla(12,65%,38%,${0.55 * fade})`;
        c.fill();
        c.strokeStyle = `hsla(12,70%,62%,${0.5 * fade})`;
        c.lineWidth = 0.8 * px;
        c.stroke();
      }
    }
    // toxin: little skulls, kept upright however the cell turns
    if (L.toxic) {
      const m = c.getTransform(),
        turn = Math.atan2(m.b, m.a);
      const k = s * 0.24;
      for (let i = 0; i < L.toxic; i++) {
        const p = SKULL_SPOTS[i]!;
        const [x, y] = this.spot(p[0], p[1]);
        c.save();
        c.translate(x, y);
        c.rotate(-turn + 0.12 * Math.sin(t * 1.4 + i * 2));
        c.globalAlpha = a0 * fade;
        c.fillStyle = 'hsla(90,35%,86%,0.85)';
        c.beginPath();
        c.arc(0, -0.12 * k, 0.62 * k, 0, TAU);
        c.rect(-0.34 * k, 0.2 * k, 0.68 * k, 0.4 * k);
        c.fill();
        c.fillStyle = `hsla(${hue},45%,10%,0.85)`;
        c.beginPath();
        c.arc(-0.24 * k, -0.08 * k, 0.17 * k, 0, TAU);
        c.moveTo(0.41 * k, -0.08 * k);
        c.arc(0.24 * k, -0.08 * k, 0.17 * k, 0, TAU);
        c.rect(-0.05 * k, 0.32 * k, 0.1 * k, 0.28 * k);
        c.fill();
        c.restore();
      }
    }
    // spores: a sac of bright dots at the back
    if (L.spores) {
      const [x, y] = this.spot(-0.6, -0.05);
      c.beginPath();
      c.ellipse(x, y, s * 0.27, s * 0.19, 0.3, 0, TAU);
      c.fillStyle = `hsla(${hue},30%,18%,${0.45 * fade})`;
      c.fill();
      c.strokeStyle = `hsla(${hue},45%,82%,${0.75 * fade})`;
      c.lineWidth = 0.9 * px;
      c.stroke();
      c.fillStyle = `hsla(${hue},60%,92%,${(0.7 + 0.25 * Math.sin(t * 3)) * fade})`;
      c.beginPath();
      for (let i = 0; i < 7; i++) {
        const r = s * 0.05,
          d = i ? 0.55 : 0,
          sx = x + Math.cos(i * 1.05) * s * 0.27 * d,
          sy = y + Math.sin(i * 1.05) * s * 0.19 * d;
        c.moveTo(sx + r, sy);
        c.arc(sx, sy, r, 0, TAU);
      }
      c.fill();
    }
    // fertility: buds growing on the rim
    for (const [th, r] of BUDS[L.fertility]!) {
      const [x, y, nx, ny] = this.edge(th + 0.05 * Math.sin(t * 0.8 + th));
      const br = s * r,
        bx = x + nx * br * 0.55,
        by = y + ny * br * 0.55;
      c.beginPath();
      c.arc(bx, by, br, 0, TAU);
      c.fillStyle = `hsla(${hue},${sat}%,52%,${0.22 * fade})`;
      c.fill();
      c.strokeStyle = `hsla(${hue},${sat}%,78%,${0.7 * fade})`;
      c.lineWidth = 1.1 * px;
      c.stroke();
      c.fillStyle = `hsla(${this.h2},60%,72%,${0.6 * fade})`;
      c.beginPath();
      c.arc(bx + nx * br * 0.15, by + ny * br * 0.15, br * 0.3, 0, TAU);
      c.fill();
    }
    // symbiosis: tiny partners riding on the membrane
    if (L.symbiosis) {
      c.fillStyle = `hsla(${(hue + 180) % 360},75%,72%,${0.85 * fade})`;
      c.beginPath();
      for (let i = 0; i < 3; i++) {
        const [x, y, nx, ny] = this.edge(i * 2.1 + t * 0.15 + 0.4);
        const rx = s * 0.15,
          ry = s * 0.09,
          rot = Math.atan2(ny, nx) + Math.PI / 2;
        c.moveTo(x + Math.cos(rot) * rx, y + Math.sin(rot) * rx);
        c.ellipse(x, y, rx, ry, rot, 0, TAU);
      }
      c.fill();
    }
    c.globalAlpha = a0;
  }

  private body(
    c: Ctx,
    cell: Pick<Cell, 'seed' | 'vx' | 'vy'>,
    sp: Species,
    R: number,
    hue: number,
    sat: number,
    px: number,
    t: number,
  ): void {
    t = this.enter(sp, t);
    const L = this.look!;
    const seed = (cell.seed % 97) / 10;
    this.shape(c, sp, L, R, t, seed);
    this.sheath(c, L, R, hue, sat, px);
    switch (sp.body) {
      case 'amoeba': {
        const moving = Math.min(1, Math.hypot(cell.vx, cell.vy) / 12);
        this.blob(c, R, 1.3 * L.wobble, sp.lobes, seed, t * 0.7, 1 + 0.18 * moving, 1 - 0.08 * moving);
        this.skin(c, hue, sat, px, R);
        this.blob(c, R * 0.78, L.wobble, sp.lobes, seed + 1, t * 0.7, 1, 1);
        c.fillStyle = `hsla(${hue},${sat}%,68%,0.09)`;
        c.fill();
        this.whips(c, sp.flagella, -R * 0.95, 0, R * 1.35, R * 0.18, t, hue, px);
        if (sp.diet === 'hunter') {
          // a food cup: two pseudopods reaching forward around the prey
          c.strokeStyle = `hsla(${hue},${sat}%,78%,${0.7 * (1 - this.dis)})`;
          c.lineWidth = 1.4 * px;
          c.beginPath();
          for (const s of [-1, 1]) {
            const r = 1 + 0.06 * Math.sin(t * 1.5 + s);
            c.moveTo(R * 0.85, s * R * 0.5);
            c.quadraticCurveTo(R * 1.38 * r, s * R * 0.5, R * 1.3 * r, s * R * 0.12);
          }
          c.stroke();
        }
        this.organelles(c, sp, R, t, 0.6);
        this.nucleus(c, R, px, -0.1 + Math.sin(t * 0.3) * 0.1, 0.05);
        break;
      }
      case 'coccus': {
        // a round cell with a slight n-fold dent (lobes); the wall breathes as much as it wobbles
        const n = L.lobes + 2,
          br = 1 + L.wobble * 0.05 * Math.sin(t * 2 + seed);
        c.beginPath();
        for (let i = 0; i < 48; i++) {
          const th = (i / 48) * TAU,
            r = R * br * (1 - 0.08 * Math.cos(n * th) + L.wobble * 0.03 * Math.sin(3 * th + t * 1.5 + seed));
          i ? c.lineTo(Math.cos(th) * r, Math.sin(th) * r) : c.moveTo(r, 0);
        }
        c.closePath();
        this.skin(c, hue, sat, px, R);
        // the cytoplasm drifts slowly about inside the wall
        c.fillStyle = `hsla(${this.h2},${Math.max(60, sat)}%,68%,0.28)`;
        c.beginPath();
        c.arc(
          R * (-0.12 + 0.13 * Math.sin(t * 0.7 + seed)),
          R * (-0.08 + 0.11 * Math.sin(t * 0.53 + seed * 1.3)),
          R * (0.45 + 0.04 * Math.sin(t * 1.1 + seed)),
          0,
          TAU,
        );
        c.fill();
        this.granules(c, sp.organelles, R, t, `hsla(${(hue + 30) % 360},70%,78%,0.6)`);
        this.whips(c, sp.flagella, -R, 0, R * 1.4, R * 0.2, t, hue, px);
        break;
      }
      case 'bacillus': {
        // a rod (long as its lobes gene) along a spine that bends as much as it wobbles
        const A = this.fA,
          w = this.fB,
          Ls = A - w,
          b = this.cAmp;
        const slope = (x: number) => (-2 * b * x) / (A * A);
        c.beginPath();
        for (let i = 0; i <= 10; i++) {
          const x = -Ls + (2 * Ls * i) / 10,
            m = slope(x),
            nl = Math.hypot(1, m);
          c.lineTo(x + (m / nl) * w, this.yAt(x) - w / nl);
        }
        const aR = Math.atan(slope(Ls)),
          aL = Math.atan(slope(-Ls));
        c.arc(Ls, this.yAt(Ls), w, aR - Math.PI / 2, aR + Math.PI / 2);
        for (let i = 10; i >= 0; i--) {
          const x = -Ls + (2 * Ls * i) / 10,
            m = slope(x),
            nl = Math.hypot(1, m);
          c.lineTo(x - (m / nl) * w, this.yAt(x) + w / nl);
        }
        c.arc(-Ls, this.yAt(-Ls), w, aL + Math.PI / 2, aL + Math.PI * 1.5);
        c.closePath();
        this.skin(c, hue, sat, px, R);
        // the nucleoid: bacteria have no nucleus, just a tangle of DNA
        c.strokeStyle = `hsla(${this.h2},65%,72%,0.6)`;
        c.lineWidth = 1.1 * px;
        c.beginPath();
        for (let i = 0; i <= 10; i++) {
          const x = -A * 0.5 + (i / 10) * A,
            y = Math.sin(i * 1.9 + seed) * w * 0.35 + this.yAt(x);
          i ? c.lineTo(x, y) : c.moveTo(x, y);
        }
        c.stroke();
        this.granules(c, sp.organelles, R, t, `hsla(${(hue + 30) % 360},70%,78%,0.6)`);
        this.whips(c, sp.flagella, -A, 0, R * 1.6, w * 0.6, t, hue, px);
        if (sp.diet === 'hunter') this.mouth(c, A * 0.95, hue, px);
        break;
      }
      case 'spirillum': {
        // a corkscrew: its lobes gene counts the turns, wobble how deep they are
        const A = this.fA,
          n = this.cFreq,
          end = Math.sin(this.cPhase) * this.cAmp;
        c.lineCap = 'round';
        const path = () => {
          c.beginPath();
          for (let i = 0; i <= 30; i++) {
            const x = -A + (i / 30) * 2 * A;
            i ? c.lineTo(x, this.yAt(x)) : c.moveTo(x, this.yAt(x));
          }
        };
        path();
        c.strokeStyle = `hsla(${hue},${sat}%,55%,0.45)`;
        c.lineWidth = R * 0.42;
        c.stroke();
        this.armour(c, hue, sat, R, 1, R * 0.42);
        c.lineCap = 'round';
        path();
        c.strokeStyle = `hsla(${this.h2},80%,70%,0.85)`;
        c.lineWidth = 1.4 * px;
        c.stroke();
        this.granules(c, sp.organelles, R, t, `hsla(${(hue + 30) % 360},70%,82%,0.7)`);
        // a tuft of flagella at either end, where the wave leaves the body
        this.whips(c, sp.flagella, -A, end, R * 0.8, R * 0.2, t * 1.5, hue, px, -1, 0.4);
        this.whips(c, sp.flagella, A, n % 2 ? -end : end, R * 0.8, R * 0.2, t * 1.5, hue, px, 1, 0.4);
        break;
      }
      case 'diatom': {
        // a glass house, shaped by its lobes gene: round, boat, triangle, square
        const boat = L.lobes === 1,
          poly = DIATOM_SIDES[L.lobes]!,
          e = DIATOM_REACH[L.lobes]!;
        const rAt = (th: number): number => {
          if (!poly) return R;
          const seg = TAU / poly,
            u = (((th % seg) + seg) % seg) - seg / 2;
          return R * e * (0.75 * (Math.cos(Math.PI / poly) / Math.cos(u)) + 0.25);
        };
        c.beginPath();
        if (boat) c.ellipse(0, 0, R * 1.5, R * 0.55, 0, 0, TAU);
        else
          for (let i = 0; i <= 48; i++) {
            const th = (i / 48) * TAU - Math.PI / 2,
              r = rAt(th + Math.PI / 2);
            i ? c.lineTo(Math.cos(th) * r, Math.sin(th) * r) : c.moveTo(Math.cos(th) * r, Math.sin(th) * r);
          }
        c.fillStyle = `hsla(${hue},${sat * 0.5}%,62%,0.13)`;
        c.fill();
        c.strokeStyle = `hsla(${hue},${sat * 0.55}%,85%,0.8)`;
        c.lineWidth = 1.3 * px;
        c.stroke();
        this.armour(c, hue, sat, R);
        c.strokeStyle = `hsla(${this.h2},70%,70%,0.45)`;
        c.lineWidth = 0.7 * px;
        c.beginPath();
        if (boat) {
          for (let i = -6; i <= 6; i++) {
            const x = (i / 6) * R * 1.3,
              h = R * 0.5 * Math.sqrt(Math.max(0, 1 - (x / (R * 1.5)) ** 2));
            c.moveTo(x, -h);
            c.lineTo(x, h);
          }
          c.moveTo(-R * 1.4, 0);
          c.lineTo(R * 1.4, 0);
        } else {
          for (let i = 0; i < 16; i++) {
            const th = (i / 16) * TAU - Math.PI / 2,
              r = rAt(th + Math.PI / 2);
            c.moveTo(Math.cos(th) * R * 0.25, Math.sin(th) * R * 0.25);
            c.lineTo(Math.cos(th) * r * 0.9, Math.sin(th) * r * 0.9);
          }
          c.moveTo(R * 0.25, 0);
          c.arc(0, 0, R * 0.25, 0, TAU);
        }
        c.stroke();
        // mucus threads it glides on
        if (sp.flagella) {
          c.strokeStyle = `hsla(${hue},20%,85%,${0.35 * (1 - this.dis)})`;
          c.lineWidth = 0.7 * px;
          c.beginPath();
          const x0 = -this.fA;
          for (let j = 0; j < sp.flagella; j++) {
            const a = (j - (sp.flagella - 1) / 2) * 0.3;
            for (let i = 0; i <= 12; i++) {
              const s = i / 12,
                d = s * R * 1.2,
                w = Math.sin(t * 0.8 - s * 5 + j) * R * 0.12 * s;
              const x = x0 - Math.cos(a) * d - Math.sin(a) * w,
                y = -Math.sin(a) * d + Math.cos(a) * w;
              i ? c.lineTo(x, y) : c.moveTo(x, y);
            }
          }
          c.stroke();
        }
        // golden chloroplasts when it lives on light
        if (sp.diet === 'photo' || sp.diet === 'omni') {
          c.fillStyle = 'hsla(44,70%,55%,0.45)';
          for (const s of sp.diet === 'photo' ? [-1, 1] : [1]) {
            c.beginPath();
            c.ellipse(s * R * (boat ? 0.6 : 0.35), 0, R * 0.32, R * 0.2, 0, 0, TAU);
            c.fill();
          }
        }
        this.granules(c, sp.organelles, R, t, 'hsla(52,80%,86%,0.55)');
        break;
      }
      case 'ciliate': {
        const a = this.fA,
          b = this.fB;
        c.beginPath();
        c.ellipse(0, 0, a, b, 0, 0, TAU);
        this.skin(c, hue, sat, px, R);
        // cilia beating in a wave around the body (they stop and fade when the cell dies)
        c.strokeStyle = `hsla(${hue},${sat * 0.75}%,82%,${0.55 * (1 - this.dis)})`;
        c.lineWidth = 0.8 * px;
        const n = 34;
        c.beginPath();
        for (let i = 0; i < n; i++) {
          const th = (i / n) * TAU,
            x = Math.cos(th) * a,
            y = Math.sin(th) * b;
          const nx = Math.cos(th) * b,
            ny = Math.sin(th) * a,
            nl = Math.hypot(nx, ny);
          const beat = Math.sin(t * 9 * (1 - this.dis) - i * 0.55) * 0.6,
            ux = nx / nl,
            uy = ny / nl;
          const L = R * 0.28;
          c.moveTo(x, y);
          c.lineTo(x + (ux * Math.cos(beat) - uy * Math.sin(beat)) * L, y + (ux * Math.sin(beat) + uy * Math.cos(beat)) * L);
        }
        c.stroke();
        // cirri: tufts of fused cilia at the back, one per flagellum
        if (sp.flagella) {
          c.lineWidth = 1.5 * px;
          c.beginPath();
          for (let j = 0; j < sp.flagella; j++) {
            const [x, y, nx, ny] = this.edge(Math.PI + (j - (sp.flagella - 1) / 2) * 0.45);
            for (let i = -1; i <= 1; i++) {
              const ang = Math.atan2(ny, nx) + i * 0.14 + Math.sin(t * 4 + j) * 0.3;
              c.moveTo(x, y);
              c.lineTo(x + Math.cos(ang) * R * 0.5, y + Math.sin(ang) * R * 0.5);
            }
          }
          c.stroke();
        }
        // oral groove and a pulsing contractile vacuole
        c.strokeStyle = `hsla(${hue},40%,35%,0.5)`;
        c.lineWidth = 1.4 * px;
        c.beginPath();
        c.moveTo(a * 0.75, -b * 0.15);
        c.quadraticCurveTo(a * 0.2, b * 0.5, -a * 0.05, b * 0.05);
        c.stroke();
        const pulse = 0.5 + 0.5 * Math.sin(t * 2);
        c.fillStyle = `hsla(200,60%,85%,${0.25 + 0.3 * pulse})`;
        c.beginPath();
        c.arc(-a * 0.55, -b * 0.25, R * (0.1 + 0.12 * pulse), 0, TAU);
        c.fill();
        this.organelles(c, sp, R, t, 0.7);
        this.nucleus(c, R, px, 0.05, 0.1);
        if (sp.diet === 'hunter') this.mouth(c, a * 0.95, hue, px);
        break;
      }
      case 'flagellate': {
        this.blob(c, R, 0.875 * L.wobble, sp.lobes, seed, t, 1.35, 0.85, 0.35);
        this.skin(c, hue, sat, px, R);
        // flagella pull from the front, like Euglena
        this.whips(c, sp.flagella, R * 1.3, 0, R * 2.2, R * 0.28, t, hue, px, 1, 0.5);
        this.organelles(c, sp, R, t, 0.5);
        this.nucleus(c, R, px, -0.25, 0);
        c.fillStyle = 'hsla(2,85%,55%,0.85)';
        c.beginPath();
        c.arc(R * 0.85, -R * 0.18, R * 0.12, 0, TAU);
        c.fill(); // red eyespot
        if (sp.diet === 'hunter') this.mouth(c, R * 1.2, hue, px);
        break;
      }
      case 'volvox': {
        c.beginPath();
        for (let i = 0; i < 48; i++) {
          const th = (i / 48) * TAU,
            r = R * (1 + L.wobble * (0.035 * Math.sin(3 * th + t * 1.2 + seed) + 0.02 * Math.sin(5 * th - t)));
          i ? c.lineTo(Math.cos(th) * r, Math.sin(th) * r) : c.moveTo(r, 0);
        }
        c.closePath();
        c.fillStyle = `hsla(${hue},${sat}%,45%,0.14)`;
        c.fill();
        c.strokeStyle = `hsla(${hue},${sat}%,75%,0.5)`;
        c.lineWidth = 1 * px;
        c.stroke();
        this.armour(c, hue, sat, R);
        // little cells on the surface (as many as its organelles gene says), turning as it rolls
        const cells = 16 + 6 * sp.organelles;
        c.fillStyle = `hsla(${hue},${sat}%,72%,0.75)`;
        c.beginPath();
        for (let i = 0; i < cells; i++) {
          const a = i * 2.39996 + t * 0.15,
            d = R * Math.sqrt((i + 0.5) / cells) * 0.97,
            x = Math.cos(a) * d,
            y = Math.sin(a) * d;
          c.moveTo(x + R * 0.045, y);
          c.arc(x, y, R * 0.045, 0, TAU);
        }
        c.fill();
        // each cell on the rim beats a pair of flagella, longer with the gene
        if (sp.flagella) {
          const len = R * (0.06 + 0.06 * sp.flagella);
          c.strokeStyle = `hsla(${hue},50%,80%,${0.5 * (1 - this.dis)})`;
          c.lineWidth = 0.7 * px;
          c.beginPath();
          for (let i = 0; i < 18; i++) {
            const a = (i / 18) * TAU + t * 0.15;
            const x = Math.cos(a) * R,
              y = Math.sin(a) * R;
            for (const s of [-1, 1]) {
              const b = a + s * 0.35 + 0.3 * Math.sin(t * 8 + i);
              c.moveTo(x, y);
              c.lineTo(x + Math.cos(b) * len, y + Math.sin(b) * len);
            }
          }
          c.stroke();
        }
        // daughter colonies inside, as many as its lobes gene says
        c.fillStyle = `hsla(${this.h2},${sat}%,55%,0.4)`;
        for (let i = 0; i < sp.lobes; i++) {
          const a = (i * TAU) / sp.lobes + t * 0.1;
          c.beginPath();
          c.arc(Math.cos(a) * R * 0.42, Math.sin(a) * R * 0.42, R * (0.26 - 0.02 * sp.lobes), 0, TAU);
          c.fill();
        }
        break;
      }
    }
    this.carried(c, sp, L, R, hue, sat, px, t);
  }

  /** a specimen on its own (the lab's drawer, bench, viewer) around x, y: radius R canvas pixels, smaller where the
   * drawing (flagella and all) would reach further than `fit` pixels from x, y */
  portrait(c: Ctx, sp: Species, x: number, y: number, R: number, fit: number, t: number, dpr: number): void {
    const [back, front] = reach(sp);
    const s = Math.min(R, fit / ((back + front) / 2)) / sp.size;
    c.save();
    c.translate(x, y);
    c.scale(s, s);
    c.rotate(-Math.PI / 5);
    // the middle of the drawing at x, y, not the body's centre (a flagellate's whip reaches far ahead)
    c.translate(((back - front) / 2) * sp.size, 0);
    if (sp.glow > 0.12) {
      // under the caller's alpha (the lab fades portraits in and out)
      const g = sp.size * (1.6 + sp.glow),
        a0 = c.globalAlpha;
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = a0 * Math.min(0.6, sp.glow * 0.55) * (0.65 + 0.35 * Math.sin(t * 1.8 + sp.seed));
      c.drawImage(this.glow(sp.hue), -g, -g, g * 2, g * 2);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = a0;
    }
    this.body(c, { seed: sp.seed, vx: 0, vy: 0 }, sp, sp.size, sp.hue, satOf(sp), dpr / s, t + (sp.seed % 1000));
    c.restore();
  }

  // ---------- the lab's hands ----------
  /** a cell was poked: it wobbles for a moment */
  jiggle(cell: Cell): void {
    this.jiggles.set(cell, 0);
  }

  /** what the hand points at (reticle and glow) and the stream being aimed; world coordinates */
  private drawHands(c: Ctx, dt: number): void {
    for (const [cell, jt] of this.jiggles) {
      if (jt + dt > 0.9 || cell.gone) this.jiggles.delete(cell);
      else this.jiggles.set(cell, jt + dt);
    }
    const k = this.k,
      px = this.dpr / k,
      T = this.time;
    const h = this.hover;
    if (h !== this.hoverOf) {
      this.hoverOf = h;
      this.hoverT = 0;
    }
    this.hoverT += dt;
    if (h && !(h === this.held && this.heldOut)) {
      const isCell = 'heading' in h;
      const R = isCell ? h.r : 6,
        hue = isCell ? h.shownHue : 95;
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.35;
      const g = R * 3.2;
      c.drawImage(this.glow(hue), h.x - g, h.y - g, g * 2, g * 2);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
      // four corner brackets that breathe, and snap in when the target changes
      let d = R * 1.35 + 6 * px;
      if (!this.gentle) {
        d *= 1 + 0.06 * Math.sin(T * 4);
        const s = Math.min(1, this.hoverT / 0.18);
        d *= 1.6 - 0.6 * (1 - (1 - s) * (1 - s));
      }
      const L = d * 0.35;
      c.strokeStyle = `hsla(${hue},80%,80%,.85)`;
      c.lineWidth = 1.5 * px;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.beginPath();
      for (const sx of [-1, 1])
        for (const sy of [-1, 1]) {
          c.moveTo(h.x + sx * d, h.y + sy * (d - L));
          c.lineTo(h.x + sx * d, h.y + sy * d);
          c.lineTo(h.x + sx * (d - L), h.y + sy * d);
        }
      c.stroke();
      if (this.hoverDna) {
        // a little bubble with a helix in it: there are genes to look at
        const r = 9 * px,
          bx = h.x + d + r * 0.6,
          by = h.y - d - r * 0.6;
        c.fillStyle = 'rgba(1,10,13,.75)';
        c.beginPath();
        c.arc(bx, by, r, 0, TAU);
        c.fill();
        c.stroke();
        c.lineWidth = 1.2 * px;
        c.beginPath();
        for (const sgn of [1, -1])
          for (let i = 0; i <= 12; i++) {
            const u = i / 12 - 0.5,
              x = bx + u * r * 1.3,
              y = by + sgn * Math.sin(u * TAU + (this.gentle ? 0 : T * 3)) * r * 0.4;
            i ? c.lineTo(x, y) : c.moveTo(x, y);
          }
        c.stroke();
      }
    }
    const a = this.aim;
    if (a) {
      c.strokeStyle = 'hsla(190,70%,75%,.5)';
      c.fillStyle = 'hsla(190,70%,75%,.5)';
      c.lineWidth = 2 * px;
      c.lineCap = 'round';
      const len = Math.hypot(a.x1 - a.x0, a.y1 - a.y0);
      c.beginPath();
      if (len < 12) {
        // too short to point anywhere: a swirl
        c.arc(a.x0, a.y0, 40, 0, TAU * 0.85);
        c.stroke();
      } else {
        const ang = Math.atan2(a.y1 - a.y0, a.x1 - a.x0),
          head = Math.min(24, len * 0.4);
        c.moveTo(a.x0, a.y0);
        c.lineTo(a.x1, a.y1);
        c.stroke();
        c.beginPath();
        c.moveTo(a.x1, a.y1);
        c.lineTo(a.x1 - Math.cos(ang - 0.45) * head, a.y1 - Math.sin(ang - 0.45) * head);
        c.lineTo(a.x1 - Math.cos(ang + 0.45) * head, a.y1 - Math.sin(ang + 0.45) * head);
        c.closePath();
        c.fill();
      }
    }
  }

  // ---------- overlays ----------
  private drawScale(c: Ctx): void {
    const d = this.dpr;
    const len = 50 * this.k; // 50 µm, one world unit is a micrometre
    const x = this.cx - this.R * 0.62,
      y = this.cy + this.R * 0.8;
    c.strokeStyle = 'rgba(190,255,235,0.45)';
    c.lineWidth = 1.5 * d;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + len, y);
    c.moveTo(x, y - 3 * d);
    c.lineTo(x, y + 3 * d);
    c.moveTo(x + len, y - 3 * d);
    c.lineTo(x + len, y + 3 * d);
    c.stroke();
    c.font = `${10 * d}px ${MONO}`;
    c.fillStyle = 'rgba(190,255,235,0.5)';
    c.textAlign = 'left';
    c.textBaseline = 'bottom';
    c.fillText('50 µm', x, y - 5 * d);
    c.textAlign = 'right';
    c.fillText(t('darkField'), this.cx + this.R * 0.62, y - 5 * d);
  }

  private drawCaption(c: Ctx, dt: number): void {
    const cap = this.captions[0];
    if (!cap) return;
    cap.t += dt;
    if (cap.t > cap.life) {
      this.captions.shift();
      return;
    }
    if (this.captions.length > 3) cap.t = Math.max(cap.t, cap.life - 0.6); // hurry when queued
    const a = Math.min(1, cap.t * 1.5, (cap.life - cap.t) * 1.2);
    const d = this.dpr,
      y = this.cy - this.R * 0.82;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const fs = Math.max(15, Math.min(24, this.R / d / 9));
    c.font = `italic ${fs * d}px ${SERIF}`;
    c.fillStyle = `hsla(${cap.hue},70%,82%,${a})`;
    c.shadowColor = `hsla(${cap.hue},80%,50%,${a * 0.8})`;
    c.shadowBlur = 12 * d;
    c.fillText(cap.title, this.cx, y);
    c.shadowBlur = 0;
    c.font = `${10.5 * d}px ${MONO}`;
    c.fillStyle = `rgba(190,255,235,${a * 0.6})`;
    c.fillText(cap.sub.toUpperCase(), this.cx, y + fs * 1.05 * d);
  }

  /** CSS pixel position on the stage -> world coordinates in the dish */
  toWorld(cssX: number, cssY: number): [number, number] {
    return [(cssX * this.dpr - this.cx) / this.k, (cssY * this.dpr - this.cy) / this.k];
  }
}

function hslRgb(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return `${Math.round(f(0) * 255)},${Math.round(f(8) * 255)},${Math.round(f(4) * 255)}`;
}
