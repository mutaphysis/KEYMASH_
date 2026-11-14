// PETRI_ renderer: a dark-field microscope. Deep teal water in a round field of view,
// out-of-focus specks drifting at two depths, slow caustic light, translucent glowing organisms.
import type { Cell, Food, Zone, World, SimEvent } from './sim';
import { DISH_R, DIVIDE_TIME, DIVIDE_GAP, TRANSVERSE } from './sim';
import type { Species } from './genome';
import type { Note } from './culture';
import { ctx2d } from '../../ui/dom';
import { t } from './messages';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const smooth = (a: number, b: number, x: number): number => {
  const u = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};
const BACTERIA = new Set(['bacillus', 'coccus', 'spirillum']);
const SERIF = 'Georgia, "Iowan Old Style", "Times New Roman", serif';
const MONO = '"Share Tech Mono", ui-monospace, monospace';

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
  /** CSS pixels at the bottom of the stage covered by the play buttons */
  reserveBottom = 0;
  gentle = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  ripples: Ripple[] = [];
  frags: Frag[] = [];
  links: Link[] = [];
  floats: Floating[] = [];
  captions: Caption[] = [];
  specks: Speck[] = [];
  private glows = new Map<number, HTMLCanvasElement>();
  private soft: HTMLCanvasElement;

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
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
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
  frame(dt: number, world: World, activity: number): void {
    dt = Math.min(dt, 0.05);
    this.time += dt;
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
    const bg = c.createRadialGradient(this.cx, this.cy - this.R * 0.2, 0, this.cx, this.cy, this.R);
    bg.addColorStop(0, '#0d3036');
    bg.addColorStop(0.6, '#072027');
    bg.addColorStop(1, '#03121a');
    c.fillStyle = bg;
    c.fillRect(this.cx - this.R, this.cy - this.R, this.R * 2, this.R * 2);
    c.setTransform(k, 0, 0, k, this.cx, this.cy);

    // caustics: slow light moving through the water
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const x = Math.sin(T * 0.05 * (i + 1) + i * 2) * DISH_R * 0.5,
        y = Math.cos(T * 0.037 * (i + 2) + i) * DISH_R * 0.45;
      const s = DISH_R * (0.9 + 0.2 * Math.sin(T * 0.1 + i));
      c.globalAlpha = 0.05 + activity * 0.03;
      c.drawImage(this.glow(175 + i * 15), x - s, y - s, s * 2, s * 2);
    }
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
    const vg = c.createRadialGradient(this.cx, this.cy, this.R * 0.72, this.cx, this.cy, this.R);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.75, 'rgba(0,4,6,0.45)');
    vg.addColorStop(1, 'rgba(0,3,5,0.95)');
    c.fillStyle = vg;
    c.beginPath();
    c.arc(this.cx, this.cy, this.R + 1, 0, TAU);
    c.fill();
    c.lineWidth = 1.2 * this.dpr;
    c.strokeStyle = 'rgba(150,255,230,0.14)';
    c.beginPath();
    c.arc(this.cx, this.cy, this.R, 0, TAU);
    c.stroke();
    c.strokeStyle = 'rgba(255,150,200,0.05)';
    c.beginPath();
    c.arc(this.cx + 1.5 * this.dpr, this.cy, this.R + 2 * this.dpr, 0, TAU);
    c.stroke();
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
      for (let i = 0; i < 4; i++) {
        const rr = z.r * (0.3 + i * 0.18),
          a0 = this.time * 0.6 * (z.swirl || 1) + i * 1.7;
        c.strokeStyle = `hsla(190,70%,75%,${0.07 * fade})`;
        c.beginPath();
        if (z.swirl) c.arc(z.x, z.y, rr, a0, a0 + 1.6);
        else {
          const ca = Math.cos(z.angle),
            sa = Math.sin(z.angle),
            off = ((this.time * 30 + i * 40) % (z.r * 1.6)) - z.r * 0.8,
            side = (i - 1.5) * 26;
          c.moveTo(z.x + ca * off - sa * side, z.y + sa * off + ca * side);
          c.lineTo(z.x + ca * (off + 40) - sa * side, z.y + sa * (off + 40) + ca * side);
        }
        c.stroke();
      }
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
    const sp = cell.sp,
      T = this.time;
    let alpha = Math.min(1, cell.age * 2 + (cell.gen > 1 ? 1 : 0));
    // dying: the membrane dissolves first, the remains fade after
    this.dis = cell.state === 'dying' ? Math.min(1, cell.t / 2.6) : 0;
    if (this.dis) alpha *= 1 - smooth(0.55, 1, this.dis);
    if (cell.state === 'eaten') alpha *= Math.max(0, 1 - cell.t / 1.5) * 0.8;
    if (alpha <= 0.01) return;
    const sick = cell.sick > 0;
    const hue = sick ? 72 : cell.shownHue,
      sat = (sick ? 30 : sp.sat) * (1 - 0.75 * smooth(0, 0.4, this.dis));
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
          this.body(c, { ...cell, seed, heading: head, r, vx: 0, vy: 0, state: 'live' }, sp, r, hue, sat, px, T + (seed % 1000));
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
        this.body(c, cell, sp, R, hue, sat, px, t);
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
    this.skin(c, hue, sat, px);
    if (sp.cilia) {
      // cilia keep beating around the dividing body
      c.strokeStyle = `hsla(${hue},55%,82%,0.45)`;
      c.lineWidth = 0.8 * px;
      for (let i = 0; i < 40; i++) {
        const th = (i / 40) * TAU,
          co = Math.cos(th),
          si = Math.sin(th);
        const r =
          Math.pow(Math.pow(Math.abs(co / A), 2) + Math.pow(Math.abs(si / B), 2), -0.5) * (1 - pinch * 0.93 * Math.exp(-(co * co) / 0.05));
        const b = th + Math.sin(t * 9 - i * 0.55) * 0.5;
        c.beginPath();
        c.moveTo(co * r, si * r);
        c.lineTo(co * r + Math.cos(b) * R * 0.25, si * r + Math.sin(b) * R * 0.25);
        c.stroke();
      }
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
      c.strokeStyle = `hsla(${sp.hue2},50%,78%,0.45)`;
      c.lineWidth = 0.8 * px;
      for (const s of [-1, 1]) {
        c.beginPath();
        for (let i = 0; i <= 8; i++) {
          const x = s * end * sep + (i / 8 - 0.5) * R * 0.6,
            y = Math.sin(i * 1.9 + s) * B * 0.3;
          i ? c.lineTo(x, y) : c.moveTo(x, y);
        }
        c.stroke();
      }
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
      c.fillStyle = `hsla(${sp.hue2},45%,32%,0.55)`;
      c.beginPath();
      c.arc(0, 0, R * (0.3 + 0.06 * smooth(0, 0.15, p)), 0, TAU);
      c.fill();
      c.strokeStyle = `hsla(${sp.hue2},60%,72%,0.5)`;
      c.lineWidth = 0.8 * px;
      c.stroke();
      c.restore();
    }
    const chrom = smooth(0.18, 0.3, p) * (1 - smooth(0.72, 0.85, p));
    if (chrom > 0.01) {
      const pull = smooth(0.48, 0.72, p) * end * 0.9; // … chromosomes line up, then are pulled to the poles
      const align = smooth(0.25, 0.45, p);
      // spindle fibres
      c.strokeStyle = `hsla(${sp.hue2},40%,85%,${0.22 * chrom})`;
      c.lineWidth = 0.6 * px;
      for (let i = 0; i < 6; i++) {
        const y = (i / 5 - 0.5) * B * 0.9;
        for (const s of [-1, 1]) {
          c.beginPath();
          c.moveTo(s * end * 0.95, 0);
          c.lineTo(s * Math.max(pull, 1), y * 0.7);
          c.stroke();
        }
      }
      c.strokeStyle = `hsla(${sp.hue2},75%,80%,${0.9 * chrom})`;
      c.lineWidth = 1.8 * px;
      c.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        const y = (i / 5 - 0.5) * B * 0.8 * (1 - 0.3 * smooth(0.48, 0.72, p));
        const x0 = Math.sin(i * 2.3 + cell.seed) * R * 0.25 * (1 - align);
        const a0 = Math.sin(i * 1.7) * 1.2 * (1 - align) + (Math.PI / 2) * align; // turn upright on the plate
        const L = R * 0.16;
        for (const s of pull > 0.5 ? [-1, 1] : [0]) {
          const x = x0 + s * pull;
          c.beginPath();
          c.moveTo(x - (Math.cos(a0) * L) / 2, y - (Math.sin(a0) * L) / 2);
          c.lineTo(x + (Math.cos(a0) * L) / 2, y + (Math.sin(a0) * L) / 2);
          c.stroke();
        }
      }
    }
    const reform = smooth(0.74, 0.95, p); // two new nuclei
    if (reform > 0.01) {
      for (const s of [-1, 1]) {
        c.save();
        c.globalAlpha *= reform;
        c.fillStyle = `hsla(${sp.hue2},45%,32%,0.55)`;
        c.beginPath();
        c.arc(s * end * 0.9, 0, R * 0.24 * (0.6 + 0.4 * reform), 0, TAU);
        c.fill();
        c.strokeStyle = `hsla(${sp.hue2},60%,72%,0.5)`;
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

  private skin(c: Ctx, hue: number, sat: number, px: number, a = 1): void {
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
  }

  private nucleus(c: Ctx, sp: Species, R: number, px: number, x = -0.15, y = 0.08): void {
    if (this.dis) {
      R *= 1 - 0.5 * this.dis;
      c.globalAlpha *= 1 - this.dis;
    }
    c.fillStyle = `hsla(${sp.hue2},45%,32%,0.55)`;
    c.beginPath();
    c.arc(R * x, R * y, R * 0.3, 0, TAU);
    c.fill();
    c.strokeStyle = `hsla(${sp.hue2},60%,72%,0.45)`;
    c.lineWidth = 0.8 * px;
    c.stroke();
    c.fillStyle = `hsla(${sp.hue2},70%,82%,0.8)`;
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

  private mouth(c: Ctx, R: number, hue: number, px: number): void {
    c.strokeStyle = `hsla(${hue},80%,80%,0.7)`;
    c.lineWidth = 1.1 * px;
    for (const s of [-0.35, 0, 0.35]) {
      c.beginPath();
      c.moveTo(R * 0.92, R * s * 0.8);
      c.lineTo(R * 1.22, R * s);
      c.stroke();
    }
  }

  private flagellum(c: Ctx, x0: number, len: number, amp: number, t: number, hue: number, px: number, dir = -1): void {
    c.strokeStyle = `hsla(${hue},60%,80%,${0.6 * (1 - this.dis)})`;
    c.lineWidth = 1 * px;
    c.lineCap = 'round';
    c.beginPath();
    for (let i = 0; i <= 16; i++) {
      const s = i / 16;
      const x = x0 + dir * s * len,
        y = Math.sin(t * 12 * (1 - this.dis) - s * 9) * amp * s;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.stroke();
  }

  private body(c: Ctx, cell: Cell, sp: Species, R: number, hue: number, sat: number, px: number, t: number): void {
    const seed = (cell.seed % 97) / 10;
    switch (sp.body) {
      case 'amoeba': {
        const moving = Math.min(1, Math.hypot(cell.vx, cell.vy) / 12);
        this.blob(c, R, 1.3, sp.lobes, seed, t * 0.7, 1 + 0.18 * moving, 1 - 0.08 * moving);
        this.skin(c, hue, sat, px);
        this.blob(c, R * 0.78, 1, sp.lobes, seed + 1, t * 0.7, 1, 1);
        c.fillStyle = `hsla(${hue},${sat}%,68%,0.09)`;
        c.fill();
        this.organelles(c, sp, R, t, 0.6);
        this.nucleus(c, sp, R, px, -0.1 + Math.sin(t * 0.3) * 0.1, 0.05);
        break;
      }
      case 'coccus': {
        c.beginPath();
        c.arc(0, 0, R, 0, TAU);
        this.skin(c, hue, sat, px);
        c.fillStyle = `hsla(${hue},${sat}%,75%,0.18)`;
        c.beginPath();
        c.arc(-R * 0.15, -R * 0.1, R * 0.45, 0, TAU);
        c.fill();
        break;
      }
      case 'bacillus': {
        const L = R * 1.25,
          w = R * 0.52;
        c.beginPath();
        c.moveTo(-L + w, -w);
        c.lineTo(L - w, -w);
        c.arc(L - w, 0, w, -Math.PI / 2, Math.PI / 2);
        c.lineTo(-L + w, w);
        c.arc(-L + w, 0, w, Math.PI / 2, Math.PI * 1.5);
        c.closePath();
        this.skin(c, hue, sat, px);
        // the nucleoid: bacteria have no nucleus, just a tangle of DNA
        c.strokeStyle = `hsla(${sp.hue2},50%,75%,0.35)`;
        c.lineWidth = 0.8 * px;
        c.beginPath();
        for (let i = 0; i <= 10; i++) {
          const x = -L * 0.5 + (i / 10) * L,
            y = Math.sin(i * 1.9 + seed) * w * 0.35;
          i ? c.lineTo(x, y) : c.moveTo(x, y);
        }
        c.stroke();
        if (sp.flagella) this.flagellum(c, -L, R * 1.6, w * 0.6, t, hue, px);
        if (sp.diet === 'hunter') this.mouth(c, L * 0.95, hue, px);
        break;
      }
      case 'spirillum': {
        const L = R * 1.6;
        c.lineCap = 'round';
        const path = () => {
          c.beginPath();
          for (let i = 0; i <= 30; i++) {
            const s = i / 30,
              x = -L + s * 2 * L,
              y = Math.sin(s * Math.PI * 3 + t * 7) * R * 0.38;
            i ? c.lineTo(x, y) : c.moveTo(x, y);
          }
        };
        path();
        c.strokeStyle = `hsla(${hue},${sat}%,55%,0.45)`;
        c.lineWidth = R * 0.42;
        c.stroke();
        path();
        c.strokeStyle = `hsla(${hue},${sat}%,82%,0.75)`;
        c.lineWidth = 1 * px;
        c.stroke();
        this.flagellum(c, -L, R * 0.8, R * 0.2, t * 1.5, hue, px);
        this.flagellum(c, L, R * 0.8, R * 0.2, t * 1.5, hue, px, 1);
        break;
      }
      case 'diatom': {
        // a glass house: centric (round) or pennate (boat shaped)
        c.rotate(t * 0.05);
        const pennate = cell.seed % 2 === 0;
        if (pennate) {
          c.beginPath();
          c.ellipse(0, 0, R * 1.5, R * 0.55, 0, 0, TAU);
        } else {
          c.beginPath();
          c.arc(0, 0, R, 0, TAU);
        }
        c.fillStyle = `hsla(${hue},35%,62%,0.13)`;
        c.fill();
        c.strokeStyle = `hsla(${hue},40%,85%,0.8)`;
        c.lineWidth = 1.3 * px;
        c.stroke();
        c.strokeStyle = `hsla(${hue},40%,85%,0.3)`;
        c.lineWidth = 0.7 * px;
        if (pennate) {
          for (let i = -6; i <= 6; i++) {
            const x = (i / 6) * R * 1.3,
              h = R * 0.5 * Math.sqrt(Math.max(0, 1 - (x / (R * 1.5)) ** 2));
            c.beginPath();
            c.moveTo(x, -h);
            c.lineTo(x, h);
            c.stroke();
          }
          c.beginPath();
          c.moveTo(-R * 1.4, 0);
          c.lineTo(R * 1.4, 0);
          c.stroke();
        } else {
          for (let i = 0; i < 16; i++) {
            const a = (i / 16) * TAU;
            c.beginPath();
            c.moveTo(Math.cos(a) * R * 0.25, Math.sin(a) * R * 0.25);
            c.lineTo(Math.cos(a) * R * 0.92, Math.sin(a) * R * 0.92);
            c.stroke();
          }
          c.beginPath();
          c.arc(0, 0, R * 0.25, 0, TAU);
          c.stroke();
        }
        // golden chloroplasts
        c.fillStyle = 'hsla(44,70%,55%,0.45)';
        for (const s of [-1, 1]) {
          c.beginPath();
          c.ellipse(s * R * (pennate ? 0.6 : 0.35), 0, R * 0.32, R * 0.2, 0, 0, TAU);
          c.fill();
        }
        break;
      }
      case 'ciliate': {
        const a = R * 1.45,
          b = R * 0.85;
        c.beginPath();
        c.ellipse(0, 0, a, b, 0, 0, TAU);
        this.skin(c, hue, sat, px);
        // cilia beating in a wave around the body (they stop and fade when the cell dies)
        c.strokeStyle = `hsla(${hue},55%,82%,${0.55 * (1 - this.dis)})`;
        c.lineWidth = 0.8 * px;
        const n = 34;
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
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x + (ux * Math.cos(beat) - uy * Math.sin(beat)) * L, y + (ux * Math.sin(beat) + uy * Math.cos(beat)) * L);
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
        this.nucleus(c, sp, R, px, 0.05, 0.1);
        if (sp.diet === 'hunter') this.mouth(c, a * 0.95, hue, px);
        break;
      }
      case 'flagellate': {
        this.blob(c, R, 0.35, 3, seed, t, 1.35, 0.85, 0.35);
        this.skin(c, hue, sat, px);
        // flagella pull from the front, like Euglena
        for (let i = 0; i < sp.flagella; i++) {
          c.save();
          c.translate(R * 1.3, 0);
          c.rotate((i - (sp.flagella - 1) / 2) * 0.5);
          this.flagellum(c, 0, R * 2.2, R * 0.28, t + i, hue, px, 1);
          c.restore();
        }
        this.organelles(c, sp, R, t, 0.5);
        this.nucleus(c, sp, R, px, -0.25, 0);
        c.fillStyle = 'hsla(2,85%,55%,0.85)';
        c.beginPath();
        c.arc(R * 0.85, -R * 0.18, R * 0.12, 0, TAU);
        c.fill(); // red eyespot
        if (sp.diet === 'hunter') this.mouth(c, R * 1.2, hue, px);
        break;
      }
      case 'volvox': {
        c.beginPath();
        c.arc(0, 0, R, 0, TAU);
        c.fillStyle = `hsla(${hue},${sat}%,45%,0.14)`;
        c.fill();
        c.strokeStyle = `hsla(${hue},${sat}%,75%,0.5)`;
        c.lineWidth = 1 * px;
        c.stroke();
        // hundreds of little cells on the surface (a few dozen here), turning as it rolls
        c.fillStyle = `hsla(${hue},${sat}%,72%,0.75)`;
        for (let i = 0; i < 36; i++) {
          const a = i * 2.39996 + t * 0.15,
            d = R * Math.sqrt((i + 0.5) / 36) * 0.97;
          c.beginPath();
          c.arc(Math.cos(a) * d, Math.sin(a) * d, R * 0.045, 0, TAU);
          c.fill();
        }
        // daughter colonies inside
        for (let i = 0; i < 3; i++) {
          const a = i * 2.1 + t * 0.1;
          c.fillStyle = `hsla(${(hue + 15) % 360},${sat}%,55%,0.4)`;
          c.beginPath();
          c.arc(Math.cos(a) * R * 0.42, Math.sin(a) * R * 0.42, R * 0.2, 0, TAU);
          c.fill();
        }
        break;
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
