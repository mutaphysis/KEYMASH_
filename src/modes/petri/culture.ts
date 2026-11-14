// PETRI_ runner: reads every line of the culture slowly (one step per beat, all lines in
// parallel) and turns what it reads into cells, food and weather in the dish.
import { readCulture } from './genome';
import type { Culture, LineProgram, Act, Species } from './genome';
import { World, DISH_R, SEED_POP } from './sim';
import type { SimEvent } from './sim';
import { hash } from '../../lang/rng';

/** seconds per beat of the feeder: slow on purpose */
export const BEAT = 0.75;

export interface Read {
  line: number;
  g0: number;
  g1: number;
  hue: number;
}
export interface Note {
  text: string;
  x: number;
  y: number;
  hue: number;
}
export type CultureEvent = SimEvent | { type: 'read'; read: Read } | { type: 'note'; note: Note };

interface Clock {
  next: number;
  i: number;
  gen: number;
}

export class Petri {
  world: World;
  culture: Culture;
  clocks: Clock[] = [];
  /** world time of the next fixed simulation step */
  private acc = 0;

  constructor(src: string, seed = hash(src) || 1) {
    this.world = new World(seed);
    this.culture = readCulture(src);
    this.resetClocks();
    // the medium starts with a little food, so the first cells have something to find
    for (let i = 0; i < 6; i++) {
      const a = this.world.rng() * Math.PI * 2,
        d = Math.sqrt(this.world.rng()) * DISH_R * 0.75;
      this.world.addFood(Math.cos(a) * d, Math.sin(a) * d, 6, 'algae', 50);
    }
  }

  private resetClocks(): void {
    this.clocks = this.culture.lines.map((_, i) => ({ next: this.world.time + 0.4 + i * 0.37 * BEAT, i: 0, gen: 0 }));
  }

  /** live edit: keep the dish, swap the program; unchanged lines keep their species */
  swap(src: string): void {
    this.culture = readCulture(src, this.culture.species);
    this.resetClocks();
  }

  get species(): Species[] {
    return this.culture.species;
  }

  /** where a keyboard position (u, v in 0..1) of a line lands in the dish */
  place(lp: LineProgram, gen: number, u: number, v: number): [number, number] {
    const a = lp.line * 2.4 + gen * 0.35;
    const x0 = (u - 0.5) * 2,
      y0 = (v - 0.5) * 1.7;
    const k = DISH_R * 0.72;
    return this.world.inside((x0 * Math.cos(a) - y0 * Math.sin(a)) * k, (x0 * Math.sin(a) + y0 * Math.cos(a)) * k, 30);
  }

  private act(lp: LineProgram, gen: number, act: Act, out: CultureEvent[]): void {
    const W = this.world;
    const at = (u: number, v: number) => this.place(lp, gen, u, v);
    switch (act.k) {
      case 'spawn': {
        const sp = lp.species;
        const [x, y] = at(act.u, act.v);
        let made = 0;
        // the code inoculates; growth after that is up to the culture
        if (sp && W.population(sp) < SEED_POP && W.crowd < 1)
          for (let i = 0; i < act.n; i++) {
            const c = W.spawnCell(sp, x + (W.rng() - 0.5) * 30, y + (W.rng() - 0.5) * 30);
            if (c) {
              made++;
              out.push({ type: 'spawn', x: c.x, y: c.y, sp });
            }
          }
        if (!made) W.addFood(x, y, 1, 'crumb', 10); // dish full: the code feeds instead
        break;
      }
      case 'food': {
        const [x, y] = at(act.u, act.v);
        W.addFood(x, y, act.n, act.kind, 22 + act.n * 4);
        break;
      }
      case 'light': {
        const [x, y] = at(act.u, act.v);
        W.addZone('light', x, y, { r: 150, dur: 14 });
        break;
      }
      case 'current': {
        const [x, y] = at(act.u, act.v);
        W.addZone('current', x, y, { r: 190, dur: 8, swirl: act.swirl, angle: act.angle + lp.line * 2.4 + gen * 0.35 });
        break;
      }
      case 'burst': {
        const [x, y] = at(act.u, act.v);
        W.addFood(x, y, 7, 'algae', 70);
        W.addZone('current', x, y, { r: 120, dur: 3, swirl: 1, strength: 0.6 });
        out.push({ type: 'bloom', x, y });
        break;
      }
      case 'garden': {
        const [x, y] = at(act.u, act.v);
        W.addZone('garden', x, y, { r: 75, dur: 14 });
        break;
      }
      case 'toxin': {
        const [x, y] = at(act.u, act.v);
        W.addZone('toxin', x, y, { r: 95, dur: 12 });
        break;
      }
      case 'spores': {
        const [x, y] = at(act.u, act.v);
        if (lp.species) W.addSpores(lp.species, x, y, act.n);
        else W.addFood(x, y, 4, 'debris', 30);
        break;
      }
      case 'temp':
        W.temp = act.t;
        break;
      case 'note': {
        const [x, y] = at(act.u, act.v);
        out.push({ type: 'note', note: { text: act.text, x, y, hue: lp.hue } });
        break;
      }
      case 'bond':
        for (const c of W.cells) if (c.sp.symbiosis) c.think = 0;
        W.addZone('light', 0, 0, { r: 110, dur: 6, strength: 0.6 });
        break;
      case 'rest':
        break;
    }
  }

  /** advance by dt seconds (real time); fixed 30 Hz simulation steps */
  tick(dt: number): CultureEvent[] {
    const out: CultureEvent[] = [];
    this.acc += Math.min(dt, 0.25);
    const STEP = 1 / 30;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      const W = this.world;
      this.culture.lines.forEach((lp, li) => {
        const ck = this.clocks[li];
        if (!ck || W.time < ck.next) return;
        const st = lp.steps[ck.i];
        if (!st) return;
        out.push({ type: 'read', read: { line: lp.line, g0: st.g0, g1: st.g1, hue: lp.hue } });
        this.act(lp, ck.gen, st.act, out);
        ck.next += st.beats * BEAT;
        ck.i++;
        if (ck.i >= lp.steps.length) {
          ck.i = 0;
          ck.gen++;
          ck.next += BEAT * 2;
        } // a breath between loops
      });
      for (const e of W.step(STEP)) out.push(e);
    }
    return out;
  }
}
