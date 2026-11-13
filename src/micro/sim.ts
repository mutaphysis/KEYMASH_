// PETRI_ simulation: a little pond in a dish. Pure (no DOM, no audio), seeded, fixed time step.
import type { Species, FoodKind } from './genome';
import { mulberry32 } from '../lang/vm';

export const DISH_R = 420;
export const MAX_CELLS = 110;
export const MAX_PER_SPECIES = 26;
export const MAX_FOOD = 200;

export interface Food { id: number; x: number; y: number; vx: number; vy: number; e: number; e0: number; kind: FoodKind; age: number; life: number; gone: boolean; spin: number }
export type CellState = 'live' | 'dividing' | 'dying' | 'eaten';
export interface Cell {
  id: number; sp: Species; x: number; y: number; vx: number; vy: number; heading: number;
  size: number; r: number; energy: number; age: number; life: number; gen: number;
  state: CellState; t: number; hue: number; speed: number;
  phase: number; wander: number; think: number; tumble: number; lastFood: number;
  food: Food | null; prey: Cell | null; threat: Cell | null; partner: Cell | null;
  eatenBy: Cell | null; sick: number; bondT: number; seed: number; gone: boolean;
  /** divide axis while dividing */ axis: number;
}
export interface Spore { x: number; y: number; sp: Species; hatch: number; hue: number }
export type ZoneKind = 'light' | 'current' | 'toxin' | 'garden';
export interface Zone { kind: ZoneKind; x: number; y: number; r: number; t0: number; until: number; strength: number; swirl: number; angle: number; acc: number }

export type SimEvent =
  | { type: 'spawn'; x: number; y: number; sp: Species }
  | { type: 'food'; x: number; y: number; n: number; kind: FoodKind }
  | { type: 'eat'; x: number; y: number; sp: Species; size: number; kind: FoodKind }
  | { type: 'engulf'; x: number; y: number; pred: Species; prey: Species; size: number }
  | { type: 'divide'; x: number; y: number; sp: Species; gen: number; size: number; axis: number }
  | { type: 'die'; x: number; y: number; sp: Species; size: number; cause: 'starved' | 'old' | 'toxin' | 'eaten' }
  | { type: 'hatch'; x: number; y: number; sp: Species }
  | { type: 'bond'; ax: number; ay: number; bx: number; by: number; a: Species; b: Species }
  | { type: 'toxic'; x: number; y: number; sp: Species }
  | { type: 'bloom'; x: number; y: number }
  | { type: 'zone'; zone: Zone }
  | { type: 'extinct'; sp: Species }
  | { type: 'first'; sp: Species };

const TAU = Math.PI * 2;
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class World {
  cells: Cell[] = [];
  food: Food[] = [];
  spores: Spore[] = [];
  zones: Zone[] = [];
  time = 0;
  /** warmth: 1 normal, < 1 sluggish, > 1 lively; drifts back to 1 */
  temp = 1;
  rng: () => number;
  counts = new Map<Species, number>();
  seen = new Set<Species>();
  private nextId = 1;
  private ev: SimEvent[] = [];

  constructor(seed = 1) { this.rng = mulberry32(seed); }

  private r(): number { return this.rng(); }
  private emit(e: SimEvent): void { this.ev.push(e); }

  /** clamp a point into the dish */
  inside(x: number, y: number, margin = 12): [number, number] {
    const d = Math.hypot(x, y), m = DISH_R - margin;
    return d > m ? [x / d * m, y / d * m] : [x, y];
  }

  population(sp?: Species): number { return sp ? this.counts.get(sp) ?? 0 : this.cells.length; }

  spawnCell(sp: Species, x: number, y: number, o: { energy?: number; gen?: number; hue?: number; size?: number; speed?: number } = {}): Cell | null {
    if (this.cells.length >= MAX_CELLS || (this.counts.get(sp) ?? 0) >= MAX_PER_SPECIES) return null;
    [x, y] = this.inside(x, y, sp.size + 8);
    const size = o.size ?? sp.size * (0.9 + this.r() * 0.2);
    const c: Cell = {
      id: this.nextId++, sp, x, y, vx: 0, vy: 0, heading: this.r() * TAU,
      size, r: size * 0.4, energy: o.energy ?? sp.divideAt * (0.45 + this.r() * 0.15), age: 0, life: sp.life * (0.8 + this.r() * 0.4), gen: o.gen ?? 1,
      state: 'live', t: 0, hue: o.hue ?? sp.hue, speed: o.speed ?? sp.speed,
      phase: this.r() * TAU, wander: this.r() * TAU, think: this.r() * 0.3, tumble: 0, lastFood: 0,
      food: null, prey: null, threat: null, partner: null, eatenBy: null, sick: 0, bondT: 0, seed: (this.r() * 1e9) | 0, gone: false, axis: 0,
    };
    this.cells.push(c);
    this.counts.set(sp, (this.counts.get(sp) ?? 0) + 1);
    if (!this.seen.has(sp)) { this.seen.add(sp); this.emit({ type: 'first', sp }); }
    return c;
  }

  addFood(x: number, y: number, n: number, kind: FoodKind, spread = 40): number {
    let made = 0;
    for (let i = 0; i < n && this.food.length < MAX_FOOD; i++) {
      const a = this.r() * TAU, d = Math.sqrt(this.r()) * spread;
      const [fx, fy] = this.inside(x + Math.cos(a) * d, y + Math.sin(a) * d, 6);
      const e = kind === 'sugar' ? 40 : kind === 'algae' ? 14 : kind === 'debris' ? 9 : 7;
      this.food.push({ id: this.nextId++, x: fx, y: fy, vx: 0, vy: 0, e, e0: e, kind, age: 0, life: kind === 'debris' ? 45 + this.r() * 20 : kind === 'crumb' ? 90 : 160 + this.r() * 60, gone: false, spin: this.r() * TAU });
      made++;
    }
    if (made) this.emit({ type: 'food', x, y, n: made, kind });
    return made;
  }

  addZone(kind: ZoneKind, x: number, y: number, o: { r?: number; dur?: number; strength?: number; swirl?: number; angle?: number } = {}): Zone {
    const z: Zone = { kind, x, y, r: o.r ?? 130, t0: this.time, until: this.time + (o.dur ?? 20), strength: o.strength ?? 1, swirl: o.swirl ?? 0, angle: o.angle ?? 0, acc: 0 };
    this.zones.push(z);
    if (this.zones.length > 16) this.zones.shift();
    this.emit({ type: 'zone', zone: z });
    return z;
  }

  addSpores(sp: Species, x: number, y: number, n: number): void {
    for (let i = 0; i < n && this.spores.length < 40; i++) {
      const a = this.r() * TAU, d = 10 + this.r() * 40;
      const [sx, sy] = this.inside(x + Math.cos(a) * d, y + Math.sin(a) * d);
      this.spores.push({ x: sx, y: sy, sp, hatch: this.time + 6 + this.r() * 10, hue: sp.hue });
    }
  }

  /** light, current push and toxin at a point */
  private field(x: number, y: number): { light: number; fx: number; fy: number; toxin: number } {
    let light = 0.15, fx = 0, fy = 0, toxin = 0;
    for (const z of this.zones) {
      const dx = x - z.x, dy = y - z.y, d = Math.hypot(dx, dy);
      if (d > z.r) continue;
      const fade = Math.min(1, (z.until - this.time) / 3, (this.time - z.t0) / 1.5);
      const k = (1 - d / z.r) * Math.max(0, fade) * z.strength;
      if (z.kind === 'light') light += k;
      else if (z.kind === 'toxin') toxin += k;
      else if (z.kind === 'current') {
        if (z.swirl) { fx += -dy / (d + 1) * z.swirl * 38 * k; fy += dx / (d + 1) * z.swirl * 38 * k; }
        else { fx += Math.cos(z.angle) * 34 * k; fy += Math.sin(z.angle) * 34 * k; }
      }
    }
    return { light, fx, fy, toxin };
  }

  step(dt: number): SimEvent[] {
    this.ev = [];
    this.time += dt;
    this.temp += (1 - this.temp) * dt * 0.05;
    const T = this.temp;

    // zones: gardens grow algae, everything expires
    for (const z of this.zones) {
      if (z.kind === 'garden') {
        z.acc += dt * 0.9 * z.strength;
        while (z.acc >= 1) { z.acc -= 1; const a = this.r() * TAU, d = Math.sqrt(this.r()) * z.r * 0.8; this.addFood(z.x + Math.cos(a) * d, z.y + Math.sin(a) * d, 1, 'algae', 0); }
      }
    }
    this.zones = this.zones.filter((z) => z.until > this.time);

    // food drifts, decays; algae in the light multiply (a bloom)
    let blooms = 0;
    for (const f of this.food) {
      const fl = this.field(f.x, f.y);
      f.vx += ((this.r() - 0.5) * 6 + fl.fx * 0.6 - f.vx) * dt;
      f.vy += ((this.r() - 0.5) * 6 + fl.fy * 0.6 - f.vy) * dt;
      f.x += f.vx * dt; f.y += f.vy * dt; f.spin += dt * 0.3;
      [f.x, f.y] = this.inside(f.x, f.y, 6);
      f.age += dt;
      if (f.kind === 'debris') f.e -= dt * 0.12;
      if (f.age > f.life || f.e <= 0.2) f.gone = true;
      if (f.kind === 'algae' && fl.light > 0.5 && this.food.length < MAX_FOOD * 0.6 && this.r() < dt * 0.03 * fl.light) {
        if (this.addFood(f.x, f.y, 1, 'algae', 14)) blooms++;
      }
    }
    if (blooms >= 1 && this.r() < 0.3) { const f = this.food[this.food.length - 1]; if (f) this.emit({ type: 'bloom', x: f.x, y: f.y }); }

    // spores hatch
    for (const s of this.spores) if (this.time >= s.hatch) {
      const c = this.spawnCell(s.sp, s.x, s.y, { hue: s.hue, energy: s.sp.divideAt * 0.35 });
      if (c) this.emit({ type: 'hatch', x: s.x, y: s.y, sp: s.sp });
      s.hatch = -1;
    }
    this.spores = this.spores.filter((s) => s.hatch >= 0);

    const born: Cell[] = [];
    for (const c of this.cells) {
      if (c.gone) continue;
      c.phase += dt * (1 + c.speed / 30);
      if (c.state === 'eaten') { this.digest(c, dt); continue; }
      if (c.state === 'dying') { this.decay(c, dt); continue; }
      if (c.state === 'dividing') { this.divide(c, dt, born); continue; }
      this.live(c, dt, T);
    }
    for (const b of born) this.cells.push(b);
    for (const c of this.cells) [c.x, c.y] = this.inside(c.x, c.y, Math.min(c.r, 40) + 2);

    // bookkeeping
    this.food = this.food.filter((f) => !f.gone);
    const before = new Map(this.counts);
    this.cells = this.cells.filter((c) => !c.gone);
    this.counts.clear();
    for (const c of this.cells) this.counts.set(c.sp, (this.counts.get(c.sp) ?? 0) + 1);
    for (const [sp, n] of before) if (n > 0 && !this.counts.get(sp)) this.emit({ type: 'extinct', sp });
    return this.ev;
  }

  private live(c: Cell, dt: number, T: number): void {
    const sp = c.sp;
    c.age += dt;
    c.sick = Math.max(0, c.sick - dt);
    c.bondT = Math.max(0, c.bondT - dt);
    const fl = this.field(c.x, c.y);

    // --- think (a few times per second): what is around me?
    c.think -= dt;
    if (c.think <= 0) {
      c.think = 0.25 + this.r() * 0.15;
      const sense2 = sp.sense * sp.sense;
      c.food = null; c.prey = null; c.threat = null; c.partner = null;
      const hungry = c.energy < sp.divideAt * 1.05;
      if (sp.diet !== 'hunter' && (sp.diet !== 'photo' || c.energy < sp.divideAt * 0.5 || fl.light < 0.4) && hungry) {
        let best = sense2;
        for (const f of this.food) {
          if (f.gone) continue;
          const d = (f.x - c.x) ** 2 + (f.y - c.y) ** 2;
          if (d < best) { best = d; c.food = f; }
        }
      }
      let bp = sense2, bt = sense2 * 0.6, bs = sense2 * 1.4;
      for (const o of this.cells) {
        if (o === c || o.gone || o.state === 'eaten') continue;
        const d = (o.x - c.x) ** 2 + (o.y - c.y) ** 2;
        if (o.sp !== sp) {
          if ((sp.diet === 'hunter' || sp.diet === 'omni') && hungry && o.state !== 'dying' && o.size < c.size * (0.82 - o.sp.armor * 0.3) && d < bp) { bp = d; c.prey = o; }
          if ((o.sp.diet === 'hunter' || o.sp.diet === 'omni') && c.size < o.size * 0.82 && d < bt) { bt = d; c.threat = o; }
          if (sp.symbiosis && o.sp.symbiosis && d < bs) { bs = d; c.partner = o; }
        }
      }
    }
    if (c.food?.gone) c.food = null;
    if (c.prey && (c.prey.gone || c.prey.state === 'eaten')) c.prey = null;
    if (c.threat?.gone) c.threat = null;
    if (c.partner?.gone) c.partner = null;

    // --- steer
    let dx = 0, dy = 0;
    c.wander += (this.r() - 0.5) * dt * 2.4;
    const wa = c.heading + Math.sin(c.wander) * 0.9;
    dx += Math.cos(wa) * 0.5; dy += Math.sin(wa) * 0.5;
    const seek = (tx: number, ty: number, w: number) => { const vx = tx - c.x, vy = ty - c.y, d = Math.hypot(vx, vy) + 1e-6; dx += vx / d * w; dy += vy / d * w; };
    if (c.threat) seek(2 * c.x - c.threat.x, 2 * c.y - c.threat.y, 2.2);
    if (c.prey) seek(c.prey.x, c.prey.y, 1.8);
    else if (c.food) seek(c.food.x, c.food.y, 1.4);
    if (sp.diet === 'photo' && !c.food && fl.light < 0.4) {
      const light = this.zones.find((z) => z.kind === 'light');
      if (light) seek(light.x, light.y, 0.8);
    }
    if (c.partner) seek(c.partner.x, c.partner.y, 0.7);
    if (sp.colony > 0.1) {
      // stay near the family, but not on top of it
      let cx = 0, cy = 0, n = 0;
      for (const o of this.cells) {
        if (o === c || o.sp !== sp || o.state !== 'live') continue;
        const ox = o.x - c.x, oy = o.y - c.y, d = Math.hypot(ox, oy);
        if (d < c.size * 6) { cx += o.x; cy += o.y; n++; }
        if (d < (c.r + o.r) * 1.05 && d > 0) { dx -= ox / d * 1.5; dy -= oy / d * 1.5; }
      }
      if (n) seek(cx / n, cy / n, sp.colony);
    }

    // --- body-specific locomotion
    let speed = c.speed * (0.55 + 0.45 * Math.min(1, c.energy / (sp.divideAt * 0.6))) * (c.sick ? 0.5 : 1);
    switch (sp.body) {
      case 'bacillus': {
        // run and tumble: keep running while food gets closer, tumble when it doesn't (chemotaxis)
        c.tumble -= dt;
        const dist = c.food ? Math.hypot(c.food.x - c.x, c.food.y - c.y) : 1e9;
        if (c.tumble <= 0) {
          if (dist > c.lastFood - 1 || !c.food) { c.heading += (this.r() - 0.5) * 3.5; c.tumble = 0.4 + this.r() * 1.2; }
          else c.tumble = 0.6;
          c.lastFood = dist;
        }
        dx = Math.cos(c.heading) * 1.2 + dx * 0.35; dy = Math.sin(c.heading) * 1.2 + dy * 0.35;
        break;
      }
      case 'flagellate': speed *= 0.55 + 0.75 * Math.max(0, Math.sin(c.phase * 2.2)); break; // darting strokes
      case 'coccus': speed *= 0.6; break;
      case 'amoeba': speed *= 0.6 + 0.4 * Math.sin(c.phase * 0.7); break; // pseudopod crawl
      case 'diatom': speed *= 0.8; break;
      case 'volvox': break;
      case 'ciliate': break;
      case 'spirillum': speed *= 1.1; break;
    }
    const dl = Math.hypot(dx, dy) || 1;
    const tx = dx / dl * speed, ty = dy / dl * speed;
    const ag = Math.min(1, dt * sp.agility);
    c.vx += (tx - c.vx) * ag + (this.r() - 0.5) * 4 * dt * (sp.body === 'coccus' ? 4 : 1); // a little Brownian jiggle
    c.vy += (ty - c.vy) * ag + (this.r() - 0.5) * 4 * dt * (sp.body === 'coccus' ? 4 : 1);
    c.x += (c.vx + fl.fx) * dt * T; c.y += (c.vy + fl.fy) * dt * T;

    // dish wall
    const d = Math.hypot(c.x, c.y), m = DISH_R - c.r - 4;
    if (d > m) {
      const nx = c.x / d, ny = c.y / d;
      c.x = nx * m; c.y = ny * m;
      const vn = c.vx * nx + c.vy * ny;
      if (vn > 0) { c.vx -= 1.8 * vn * nx; c.vy -= 1.8 * vn * ny; }
      c.heading = Math.atan2(c.vy, c.vx);
    }
    const sp2 = Math.hypot(c.vx, c.vy);
    if (sp2 > 1.5 && sp.body !== 'bacillus') c.heading += wrapAngle(Math.atan2(c.vy, c.vx) - c.heading) * Math.min(1, dt * 3);
    if (sp.body === 'volvox') c.heading += dt * 0.4;

    // --- eat
    if (c.food && !c.food.gone) {
      const f = c.food;
      if (Math.hypot(f.x - c.x, f.y - c.y) < c.r + 3) {
        const bite = Math.min(f.e, dt * (6 + c.size * 0.9));
        f.e -= bite; c.energy += bite;
        if (f.e <= 0.2) { f.gone = true; c.food = null; this.emit({ type: 'eat', x: c.x, y: c.y, sp, size: c.size, kind: f.kind }); }
      }
    }
    if (sp.diet === 'photo') c.energy += dt * (0.35 + fl.light * 3.2) * (c.size / 14);
    else if (sp.diet === 'omni') c.energy += dt * fl.light * 0.4;

    // --- hunt
    if (c.prey && !c.prey.gone && c.prey.state !== 'eaten' && Math.hypot(c.prey.x - c.x, c.prey.y - c.y) < c.r + c.prey.r * 0.6) {
      const p = c.prey;
      if (p.state === 'live' || p.state === 'dividing' || p.state === 'dying') {
        p.state = 'eaten'; p.eatenBy = c; p.t = 0;
        c.energy += Math.max(10, p.energy * 0.6) + 12;
        this.emit({ type: 'engulf', x: c.x, y: c.y, pred: sp, prey: p.sp, size: c.size });
        if (p.sp.toxic > 0 && sp.toxic < p.sp.toxic) {
          c.sick = 4 + p.sp.toxic * 8; c.energy -= p.sp.toxic * 35;
          this.emit({ type: 'toxic', x: c.x, y: c.y, sp });
        }
      }
      c.prey = null;
    }

    // --- symbiosis: touching partners even out their energy and both get a small gift
    if (c.partner && c.bondT <= 0 && Math.hypot(c.partner.x - c.x, c.partner.y - c.y) < c.r + c.partner.r + 6) {
      const p = c.partner, avg = (c.energy + p.energy) / 2;
      c.energy = avg + 2; p.energy = avg + 2;
      c.bondT = p.bondT = 14;
      this.emit({ type: 'bond', ax: c.x, ay: c.y, bx: p.x, by: p.y, a: sp, b: p.sp });
    }

    // --- metabolism, toxin, size
    if (fl.toxin > 0 && sp.toxic < 0.5) c.energy -= dt * 14 * fl.toxin;
    const moving = Math.hypot(c.vx, c.vy) / 50;
    c.energy -= dt * (0.45 + moving * moving * 1.1) * (c.size / 14) * T * (c.sick ? 1.6 : 1);
    const target = c.size * (0.8 + 0.35 * Math.min(1.1, c.energy / sp.divideAt));
    c.r += (target - c.r) * Math.min(1, dt * 1.5);

    if (c.energy >= sp.divideAt && c.age > 5 && this.cells.length < MAX_CELLS && (this.counts.get(sp) ?? 0) < MAX_PER_SPECIES) {
      c.state = 'dividing'; c.t = 0; c.axis = c.heading + Math.PI / 2;
    } else if (c.energy <= 0 || c.age > c.life) {
      c.state = 'dying'; c.t = 0;
      this.emit({ type: 'die', x: c.x, y: c.y, sp, size: c.size, cause: c.energy <= 0 ? (fl.toxin > 0 ? 'toxin' : 'starved') : 'old' });
    }
  }

  private divide(c: Cell, dt: number, born: Cell[]): void {
    c.t += dt;
    c.vx *= 0.9; c.vy *= 0.9;
    if (c.t < 1.6) return;
    const sp = c.sp, m = sp.mutation;
    const mut = (v: number, k: number) => v * (1 + (this.r() - 0.5) * 2 * m * k);
    const off = c.r * 0.6;
    const ax = Math.cos(c.axis) * off, ay = Math.sin(c.axis) * off;
    const e = c.energy * 0.48;
    // daughter A replaces the mother, B is new
    c.state = 'live'; c.t = 0; c.energy = e; c.gen++; c.age = 0; c.x += ax; c.y += ay; c.r *= 0.75;
    c.hue = (c.hue + (this.r() - 0.5) * m * 70 + 360) % 360;
    c.size = Math.max(5, Math.min(40, mut(c.size, 0.5)));
    c.speed = Math.max(3, mut(c.speed, 0.6));
    const b: Cell = {
      ...c, id: this.nextId++, x: c.x - 2 * ax, y: c.y - 2 * ay, vx: -c.vx, vy: -c.vy, heading: c.heading + Math.PI,
      hue: (c.hue + (this.r() - 0.5) * m * 70 + 360) % 360, size: Math.max(5, Math.min(40, mut(c.size, 0.5))), speed: Math.max(3, mut(c.speed, 0.6)),
      phase: this.r() * TAU, seed: (this.r() * 1e9) | 0, food: null, prey: null, threat: null, partner: null, life: sp.life * (0.8 + this.r() * 0.4),
    };
    born.push(b);
    this.counts.set(sp, (this.counts.get(sp) ?? 0) + 1);
    this.emit({ type: 'divide', x: c.x - ax, y: c.y - ay, sp, gen: c.gen, size: c.size, axis: c.axis });
  }

  private decay(c: Cell, dt: number): void {
    c.t += dt; c.vx *= 0.97; c.vy *= 0.97; c.x += c.vx * dt; c.y += c.vy * dt;
    if (c.t < 2.6) return;
    c.gone = true;
    this.addFood(c.x, c.y, 2 + Math.floor(c.size / 10), 'debris', c.r);
    if (c.sp.spores) this.addSpores(c.sp, c.x, c.y, 2);
  }

  private digest(c: Cell, dt: number): void {
    c.t += dt;
    const p = c.eatenBy;
    if (p && !p.gone) { c.x += (p.x - c.x) * Math.min(1, dt * 4); c.y += (p.y - c.y) * Math.min(1, dt * 4); }
    c.r *= Math.pow(0.4, dt);
    if (c.t > 1.5 || !p || p.gone) {
      c.gone = true;
      this.emit({ type: 'die', x: c.x, y: c.y, sp: c.sp, size: c.size, cause: 'eaten' });
    }
  }
}
