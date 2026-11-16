// MYCELIUM_ play mode: reads the ground from the text, draws it on its own WebGL canvas (the shared #stage already
// has a 2D context), and lets the camera be dragged (or scrolled) around the forest floor. Edits ease the ground
// into its new shape.
import type { AudioEngine } from '../../engine/audio';
import type { ModePlayer, PlayerHost } from '../types';
import { $ } from '../../ui/dom';
import { VERSION_LABEL } from '../../version';
import { fetchAssets } from './assets';
import type { Assets } from './assets';
import { readGround, WORLD } from './ground';
import { ForestRenderer } from './render';
import { t } from './messages';
import { stage3d } from './theme.css';

/** view units per metre (3.75 per cm, ASSETS.md) */
const PER_M = 375;
/** how fast a flung camera slows down: its speed keeps this share per second */
const GLIDE = 0.04;

export class ForestPlayer implements ModePlayer {
  wrap = $('stageWrap');
  codeview = $('codeview');
  hud = $('hud');
  logEl = $('log');
  boot = $('boot');
  canvas: HTMLCanvasElement;
  r: ForestRenderer;
  src: string | undefined;
  running = false;
  /** true from start() until stop(): this player owns the shared stage */
  active = false;
  private uploaded: Assets | null = null;
  private fitW = 0;
  private fitH = 0;
  private raf = 0;
  private lastFrame = 0;
  private run = 0;
  /** the fingers (or the mouse) on the stage, where their centre and spread were last, and the camera's speed in CSS px/s */
  private touches = new Map<number, { x: number; y: number }>();
  private gesture: { x: number; y: number; spread: number; t: number } | null = null;
  private vx = 0;
  private vy = 0;

  constructor(_audio: AudioEngine, _host: PlayerHost) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = stage3d;
    $('stage').after(this.canvas);
    this.r = new ForestRenderer(this.canvas);
    new ResizeObserver(() => {
      if (this.active) this.fit();
    }).observe(this.wrap); // the stage is shared: only the active player sizes it
    this.canvas.addEventListener('pointerdown', (e) => this.down(e));
    this.canvas.addEventListener('pointermove', (e) => this.move(e));
    for (const ev of ['pointerup', 'pointercancel'] as const) this.canvas.addEventListener(ev, (e) => this.up(e));
    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const k = e.deltaMode === 1 ? 16 : 1; // lines → pixels
        // a trackpad pinch arrives as a wheel with ctrl held
        if (e.ctrlKey) this.r.zoomAt(Math.exp(-e.deltaY * k * 0.01), e.offsetX, e.offsetY);
        else this.r.pan(-e.deltaX * k, -e.deltaY * k);
        this.vx = this.vy = 0;
      },
      { passive: false },
    );
    this.loop = this.loop.bind(this);
  }

  fit(): void {
    // layout size, not getBoundingClientRect: transition animations transform the app
    const w = this.wrap.clientWidth;
    const h = this.wrap.clientHeight;
    if (w < 2 || h < 2) return;
    this.fitW = w;
    this.fitH = h;
    this.r.resize(w, h);
  }

  async start(src: string): Promise<void> {
    this.stop(true);
    const run = ++this.run;
    this.active = true;
    this.src = src;
    this.canvas.classList.add('on');
    this.fit();
    this.codeview.textContent = src;
    this.codeview.scrollTop = 0;
    this.logEl.textContent = ''; // another mode's notes
    this.hud.textContent = '';
    const boot = this.boot;
    boot.classList.add('on');
    boot.textContent = `mycelium ${VERSION_LABEL}\n`;
    if (!this.r.ok) {
      boot.textContent += t('noGl');
      return;
    }
    const line = document.createTextNode('');
    boot.append(line);
    let assets: Assets;
    try {
      assets = await fetchAssets((n, total) => (line.textContent = t('bootLoad', { pct: Math.floor((100 * n) / total) })));
    } catch (e) {
      if (run === this.run) line.textContent = t('bootFailed', { err: e instanceof Error ? e.message : String(e) });
      return;
    }
    if (run !== this.run) return; // stopped or restarted meanwhile
    if (this.uploaded !== assets) {
      this.r.upload(assets);
      this.uploaded = assets;
    }
    const g = readGround(src);
    this.r.setGround(g, true);
    this.r.home();
    this.vx = this.vy = 0;
    this.r.frame(0); // the shaders compile behind the boot text
    line.textContent = t('bootLoad', { pct: 100 }) + '\n';
    boot.append(t('bootGround', { m: ((WORLD.x1 - WORLD.x0) / PER_M).toFixed(1), cm: Math.round(g.bands[0] / 3.75) }));
    await new Promise((res) => setTimeout(res, 420));
    if (run !== this.run) return;
    boot.classList.remove('on');
    this.running = true;
    this.lastFrame = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
  }

  stop(_silent = false): void {
    this.run++;
    this.running = false;
    this.active = false;
    this.touches.clear();
    this.gesture = null;
    cancelAnimationFrame(this.raf);
    this.canvas.classList.remove('on', 'drag');
    this.boot.classList.remove('on');
  }

  restart(): void {
    if (this.src !== undefined) void this.start(this.src);
  }

  hotSwap(src: string): void {
    if (!this.running || src === this.src) return;
    this.src = src;
    const top = this.codeview.scrollTop;
    this.codeview.textContent = src;
    this.codeview.scrollTop = top;
    this.r.setGround(readGround(src));
  }

  /** centre and spread (mean distance from the centre) of the fingers down */
  private centre(t: number): { x: number; y: number; spread: number; t: number } {
    let x = 0;
    let y = 0;
    for (const p of this.touches.values()) {
      x += p.x;
      y += p.y;
    }
    const n = Math.max(1, this.touches.size);
    x /= n;
    y /= n;
    let spread = 0;
    for (const p of this.touches.values()) spread += Math.hypot(p.x - x, p.y - y) / n;
    return { x, y, spread, t };
  }

  private down(e: PointerEvent): void {
    if (!this.running) return;
    this.canvas.setPointerCapture(e.pointerId);
    this.canvas.classList.add('drag');
    this.touches.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    this.gesture = this.centre(e.timeStamp); // a finger more: measure from here, so nothing jumps
    this.vx = this.vy = 0;
  }

  /** one finger pans, two or more pan with their centre and zoom with their spread */
  private move(e: PointerEvent): void {
    const g = this.gesture;
    if (!g || !this.touches.has(e.pointerId)) return;
    this.touches.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    const c = this.centre(e.timeStamp);
    const dx = c.x - g.x;
    const dy = c.y - g.y;
    this.r.pan(dx, dy);
    if (this.touches.size > 1 && g.spread > 0 && c.spread > 0) this.r.zoomAt(c.spread / g.spread, c.x, c.y);
    else {
      // the fling speed: smoothed over the last moves
      const dt = Math.max(1, c.t - g.t) / 1000;
      this.vx += (dx / dt - this.vx) * 0.5;
      this.vy += (dy / dt - this.vy) * 0.5;
    }
    this.gesture = c;
  }

  private up(e: PointerEvent): void {
    const g = this.gesture;
    if (!g || !this.touches.delete(e.pointerId)) return;
    if (this.touches.size) {
      this.gesture = this.centre(e.timeStamp);
      this.vx = this.vy = 0; // the end of a pinch doesn't fling
      return;
    }
    this.gesture = null;
    this.canvas.classList.remove('drag');
    // held still before letting go: no fling
    if (e.timeStamp - g.t > 80 || this.r.gentle) this.vx = this.vy = 0;
  }

  private loop(now: number): void {
    if (!this.running) return;
    if (this.wrap.clientWidth !== this.fitW || this.wrap.clientHeight !== this.fitH) this.fit();
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (!this.gesture && (this.vx || this.vy)) {
      this.r.pan(this.vx * dt, this.vy * dt);
      const k = Math.pow(GLIDE, dt);
      this.vx *= k;
      this.vy *= k;
      if (Math.hypot(this.vx, this.vy) < 4) this.vx = this.vy = 0;
    }
    this.r.frame(dt);
  }
}
