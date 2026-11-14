// PETRI_ editor backdrop: plankton drifting slowly behind the text, typed glyphs float up as bubbles.
import { keyInfo } from '../../lang/keys';
import type { Backdrop } from '../types';

interface Drifter {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  a: number;
  hue: number;
  ph: number;
}
interface Bubble {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  hue: number;
}

const COUNT = 34;
const HUES = [174, 150, 96, 204, 276];

export class Plankton implements Backdrop {
  private plankton: Drifter[] = [];
  private parts: Bubble[] = [];
  private w = 0;
  private h = 0;

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  typed(ch: string, x: number, y: number): void {
    const hue = 165 + keyInfo(ch || 'a').col * 6;
    for (let i = 0; i < 5; i++)
      this.parts.push({
        x: x + (Math.random() - 0.5) * 10,
        y,
        vx: (Math.random() - 0.5) * 20,
        vy: -30 - Math.random() * 50,
        life: 0.9 + Math.random() * 0.8,
        age: 0,
        hue,
      });
  }

  draw(c: CanvasRenderingContext2D, s: CanvasRenderingContext2D, dt: number): void {
    c.clearRect(0, 0, this.w, this.h);
    for (let i = this.plankton.length; i < COUNT; i++) {
      this.plankton.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        r: 1 + Math.random() * (i % 7 === 0 ? 7 : 2.5),
        vx: 0,
        vy: 0,
        a: 0.15 + Math.random() * 0.3,
        hue: HUES[i % 5]!,
        ph: Math.random() * 6,
      });
    }
    c.globalCompositeOperation = 'lighter';
    for (const p of this.plankton) {
      p.vx += ((Math.random() - 0.5) * 12 - p.vx) * dt * 0.6;
      p.vy += ((Math.random() - 0.5) * 12 - 3 - p.vy) * dt * 0.6;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.ph += dt;
      if (p.y < -10) p.y = this.h + 10;
      if (p.x < -10) p.x = this.w + 10;
      if (p.x > this.w + 10) p.x = -10;
      const a = p.a * (0.7 + 0.3 * Math.sin(p.ph * 1.3));
      c.strokeStyle = `hsla(${p.hue},70%,70%,${a})`;
      c.lineWidth = 1;
      c.beginPath();
      c.arc(p.x, p.y, p.r, 0, 6.3);
      c.stroke();
      if (p.r > 3) {
        c.fillStyle = `hsla(${p.hue},70%,70%,${a * 0.25})`;
        c.fill();
        c.fillStyle = `hsla(${p.hue},60%,80%,${a})`;
        c.beginPath();
        c.arc(p.x - p.r * 0.2, p.y, p.r * 0.3, 0, 6.3);
        c.fill();
      }
    }
    c.globalCompositeOperation = 'source-over';
    s.clearRect(0, 0, this.w, this.h);
    this.parts = this.parts.filter((p) => (p.age += dt) < p.life);
    for (const p of this.parts) {
      p.vx *= Math.pow(0.3, dt);
      p.x += (p.vx + Math.sin(p.age * 8) * 6) * dt;
      p.y += p.vy * dt;
      const a = 0.8 * (1 - p.age / p.life),
        r = 1.5 + p.age * 2.5;
      s.strokeStyle = `hsla(${p.hue},80%,80%,${a})`;
      s.lineWidth = 1;
      s.beginPath();
      s.arc(p.x, p.y, r, 0, 6.3);
      s.stroke();
    }
  }
}
