// MYCELIUM_ editor backdrop: spores drifting slowly up through the dark, every typed glyph lets a few more go.
import type { Backdrop } from '../types';

interface Spore {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  a: number;
  ph: number;
  /** seconds left; Infinity for the ones always in the air */
  life: number;
}

const COUNT = 36;

export class Spores implements Backdrop {
  private spores: Spore[] = [];
  private w = 0;
  private h = 0;

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  typed(ch: string, x: number, y: number): void {
    if (!ch) return;
    for (let i = 0; i < 3; i++)
      this.spores.push({
        x: x + (Math.random() - 0.5) * 10,
        y,
        r: 0.7 + Math.random() * 1.1,
        vx: (Math.random() - 0.5) * 20,
        vy: -10 - Math.random() * 20,
        a: 0.5,
        ph: Math.random() * 6,
        life: 1.2 + Math.random(),
      });
  }

  draw(c: CanvasRenderingContext2D, front: CanvasRenderingContext2D, dt: number): void {
    c.clearRect(0, 0, this.w, this.h);
    front.clearRect(0, 0, this.w, this.h);
    let resident = 0;
    for (const s of this.spores) if (s.life === Infinity) resident++;
    for (; resident < COUNT; resident++)
      this.spores.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        r: 0.5 + Math.random() * (resident % 7 === 0 ? 2 : 1),
        vx: 0,
        vy: -(2 + Math.random() * 5),
        a: 0.1 + Math.random() * 0.22,
        ph: Math.random() * 6,
        life: Infinity,
      });
    this.spores = this.spores.filter((s) => (s.life -= dt) > 0);
    for (const s of this.spores) {
      s.vx += ((Math.random() - 0.5) * 8 - s.vx) * dt * 0.6;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.ph += dt;
      if (s.y < -6) {
        s.y = this.h + 6;
        s.x = Math.random() * this.w;
      }
      const fade = s.life === Infinity ? 1 : Math.min(1, s.life);
      c.fillStyle = `rgba(232,220,190,${s.a * fade * (0.7 + 0.3 * Math.sin(s.ph * 1.3))})`;
      c.beginPath();
      c.arc(s.x, s.y, s.r, 0, 6.3);
      c.fill();
    }
  }
}
