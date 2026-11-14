// COOKIE_ editor backdrop: flour drifting down slowly behind the text, every typed glyph puffs a little more.
import type { Backdrop } from '../types';

interface Speck {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  a: number;
  ph: number;
}
interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
}

const COUNT = 40;

export class Flour implements Backdrop {
  private specks: Speck[] = [];
  private puffs: Puff[] = [];
  private w = 0;
  private h = 0;

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  typed(_ch: string, x: number, y: number): void {
    for (let i = 0; i < 4; i++)
      this.puffs.push({
        x: x + (Math.random() - 0.5) * 8,
        y,
        vx: (Math.random() - 0.5) * 50,
        vy: -15 - Math.random() * 35,
        life: 0.7 + Math.random() * 0.7,
        age: 0,
      });
  }

  draw(c: CanvasRenderingContext2D, s: CanvasRenderingContext2D, dt: number): void {
    c.clearRect(0, 0, this.w, this.h);
    for (let i = this.specks.length; i < COUNT; i++)
      this.specks.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        r: 0.6 + Math.random() * (i % 6 === 0 ? 2.6 : 1.2),
        vx: 0,
        vy: 4 + Math.random() * 8,
        a: 0.12 + Math.random() * 0.25,
        ph: Math.random() * 6,
      });
    for (const p of this.specks) {
      p.vx += ((Math.random() - 0.5) * 10 - p.vx) * dt * 0.5;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.ph += dt;
      if (p.y > this.h + 6) {
        p.y = -6;
        p.x = Math.random() * this.w;
      }
      c.fillStyle = `rgba(255,236,208,${p.a * (0.7 + 0.3 * Math.sin(p.ph))})`;
      c.beginPath();
      c.arc(p.x, p.y, p.r, 0, 6.3);
      c.fill();
    }
    s.clearRect(0, 0, this.w, this.h);
    this.puffs = this.puffs.filter((p) => (p.age += dt) < p.life);
    for (const p of this.puffs) {
      p.vx *= Math.pow(0.15, dt);
      p.vy += 60 * dt; // flour settles
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      s.fillStyle = `rgba(255,240,220,${0.6 * (1 - p.age / p.life)})`;
      s.beginPath();
      s.arc(p.x, p.y, 1 + p.age * 2, 0, 6.3);
      s.fill();
    }
  }
}
