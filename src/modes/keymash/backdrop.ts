// KEYMASH_ editor backdrop: matrix rain behind the text (typed glyphs drop into it), sparks at the caret.
import { keyInfo } from '../../lang/keys';
import type { Backdrop } from '../types';

const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ0123456789#$%&@!?*<>{}[]~^';

interface RainCol { y: number; v: number; step?: number; inject?: string | null }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; age: number; hue: number }

export class MatrixRain implements Backdrop {
  private cols: RainCol[] = [];
  private parts: Spark[] = [];
  private recent: string[] = [];
  private w = 0; private h = 0;

  resize(w: number, h: number): void {
    this.w = w; this.h = h;
    const n = Math.ceil(w / 16);
    while (this.cols.length < n) this.cols.push({ y: Math.random() * h, v: 40 + Math.random() * 90 });
    this.cols.length = n;
  }

  typed(ch: string, x: number, y: number): void {
    const hue = 100 + keyInfo(ch || 'a').col * 18;
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 160;
      this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: 0.4 + Math.random() * 0.5, age: 0, hue });
    }
    if (this.parts.length > 400) this.parts.splice(0, this.parts.length - 400);
    if (!ch.trim()) return;
    this.recent.push(ch); if (this.recent.length > 60) this.recent.shift();
    // drop the typed char into a rain column
    const col = this.cols[Math.floor(Math.random() * this.cols.length)];
    if (col) col.inject = ch;
  }

  draw(c: CanvasRenderingContext2D, s: CanvasRenderingContext2D, dt: number): void {
    c.fillStyle = 'rgba(0,10,3,0.16)'; c.fillRect(0, 0, this.w, this.h);
    c.font = '15px "Share Tech Mono", monospace'; c.textAlign = 'center';
    this.cols.forEach((col, i) => {
      col.y += col.v * dt;
      if (col.y > this.h + 40) { col.y = -20 - Math.random() * 200; col.v = 40 + Math.random() * 90; }
      const step = Math.floor(col.y / 18);
      if (step !== col.step) {
        col.step = step;
        const g = col.inject || (this.recent.length && Math.random() < 0.3 ? this.recent[(Math.random() * this.recent.length) | 0] : GLYPHS[(Math.random() * GLYPHS.length) | 0]);
        const injected = !!col.inject; col.inject = null;
        c.fillStyle = injected ? '#ffffff' : 'rgba(57,255,122,0.85)';
        c.fillText(g!, i * 16 + 8, step * 18);
      }
    });
    s.clearRect(0, 0, this.w, this.h);
    s.globalCompositeOperation = 'lighter';
    this.parts = this.parts.filter((p) => (p.age += dt) < p.life);
    for (const p of this.parts) {
      p.vy += 300 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      const a = 1 - p.age / p.life;
      s.fillStyle = `hsla(${p.hue},100%,65%,${a})`; s.beginPath(); s.arc(p.x, p.y, 2.2, 0, 6.3); s.fill();
    }
    s.globalCompositeOperation = 'source-over';
  }
}
