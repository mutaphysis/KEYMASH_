// COOKIE_ play mode: runs the bakery, draws it on its own WebGL canvas (the shared #stage already
// has a 2D context), plays the jingle, lights up the part of the recipe that is being worked on,
// and turns taps into bites.
import { Bakery } from './bakery';
import type { BakeEvent } from './bakery';
import type { Stage } from './recipe';
import { CookieRenderer } from './render';
import { Jingle } from './music';
import type { AudioEngine } from '../../engine/audio';
import type { ModePlayer } from '../types';
import { $ } from '../../ui/dom';
import { VERSION_LABEL } from '../../version';
import { t, tn } from './messages';
import type { CookieMsg } from './messages';
import { stage3d, greeting } from './theme.css';

const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const LOG: Partial<Record<Stage, CookieMsg>> = {
  drop: 'logDrop',
  roll: 'logRoll',
  cut: 'logCut',
  chips: 'logChips',
  bake: 'logBake',
  cool: 'logCool',
  coat: 'logCoat',
  pattern: 'logPattern',
  toppings: 'logToppings',
  deco: 'logDeco',
  sweep: 'logSweep',
};
/** the colour a stage lights its words up in */
const HUE: Partial<Record<Stage, number>> = {
  drop: 35,
  roll: 35,
  cut: 200,
  chips: 20,
  bake: 12,
  coat: 330,
  pattern: 280,
  toppings: 50,
  deco: 170,
  present: 120,
};

export class CookiePlayer implements ModePlayer {
  audio: AudioEngine;
  jingle: Jingle;
  wrap = $('stageWrap');
  codeview = $('codeview');
  hud = $('hud');
  logEl = $('log');
  boot = $('boot');
  canvas: HTMLCanvasElement;
  greet: HTMLDivElement;
  r: CookieRenderer;
  bakery: Bakery | null = null;
  src: string | undefined;
  running = false;
  /** true from start() until stop(): this player owns the shared stage */
  active = false;
  spans: HTMLSpanElement[] = [];
  logs: string[] = [];
  private lit: HTMLSpanElement[] = [];
  private hlLast: HTMLSpanElement | null = null;
  private fitW = 0;
  private fitH = 0;
  private raf = 0;
  private lastFrame = 0;
  private hudTick = 0;
  private run = 0;

  constructor(audio: AudioEngine) {
    this.audio = audio;
    this.jingle = new Jingle(audio);
    this.canvas = document.createElement('canvas');
    this.canvas.className = stage3d;
    $('stage').after(this.canvas);
    this.greet = document.createElement('div');
    this.greet.className = greeting;
    this.logEl.after(this.greet);
    this.r = new CookieRenderer(this.canvas);
    new ResizeObserver(() => {
      if (this.active) this.fit();
    }).observe(this.wrap); // the stage is shared: only the active player sizes it
    this.canvas.addEventListener('pointerdown', (e) => this.tap(e));
    this.loop = this.loop.bind(this);
  }

  fit(): void {
    // layout size, not getBoundingClientRect: transition animations transform the app
    const w = this.wrap.clientWidth;
    const h = this.wrap.clientHeight;
    if (w < 2 || h < 2) return;
    this.fitW = w;
    this.fitH = h;
    this.r.reserveBottom = 76; // the play buttons
    this.r.resize(w, h);
    if (this.bakery) this.bakery.aspect = w / h; // the next batch is laid out for it
  }

  private buildCode(gs: string[], keepScroll = false): void {
    const cv = this.codeview;
    const top = cv.scrollTop;
    cv.textContent = '';
    const frag = document.createDocumentFragment();
    this.spans = gs.map((g) => {
      const s = document.createElement('span');
      s.textContent = g === '\r\n' ? '\n' : g;
      frag.appendChild(s);
      return s;
    });
    cv.appendChild(frag);
    cv.scrollTop = keepScroll ? top : 0;
    this.lit = [];
    this.hlLast = null;
  }

  async start(src: string): Promise<void> {
    this.stop(true);
    const run = ++this.run;
    this.active = true;
    this.src = src;
    this.audio.init();
    this.canvas.classList.add('on');
    this.fit();
    const b = (this.bakery = new Bakery(src, this.fitW / Math.max(1, this.fitH)));
    b.gentle = this.r.gentle;
    this.buildCode(b.recipe.gs);
    this.logs = [];
    this.logEl.textContent = '';
    this.hud.textContent = '';
    this.greet.textContent = '';
    this.jingle.configure(b.recipe.seed);
    if (!this.r.ok) {
      this.note(t('noGl'));
      return;
    }
    this.r.snap(b);
    this.r.frame(0, b, 0); // the shader compiles behind the boot text
    await this.bootSequence(b);
    if (run !== this.run) return; // stopped or restarted meanwhile
    this.jingle.start();
    this.running = true;
    this.lastFrame = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
  }

  private bootSequence(b: Bakery): Promise<void> {
    const r = b.recipe;
    const lines = [
      `cookie ${VERSION_LABEL}`,
      tn('bootRecipe', r.count, { dough: t(r.dough), shape: t(r.shape) }),
      t('bootOven', { temp: r.temp, min: r.minutes }),
      t('bootTune', { key: this.jingle.describe() }),
    ];
    this.boot.classList.add('on');
    this.boot.textContent = '';
    return new Promise<void>((res) => {
      let i = 0;
      const step = () => {
        if (i >= lines.length) {
          setTimeout(() => {
            this.boot.classList.remove('on');
            res();
          }, 260);
          return;
        }
        this.boot.textContent += lines[i++] + '\n';
        setTimeout(step, 150);
      };
      step();
    });
  }

  stop(silent = false): void {
    this.run++;
    this.running = false;
    this.active = false;
    cancelAnimationFrame(this.raf);
    this.jingle.stop();
    this.canvas.classList.remove('on');
    this.greet.classList.remove('on');
    if (!silent) this.audio.stop();
  }

  restart(): void {
    if (this.src !== undefined) void this.start(this.src);
  }

  hotSwap(src: string): void {
    const b = this.bakery;
    if (!this.running || !b || src === this.src) return;
    this.src = src;
    const changed = b.swap(src);
    this.buildCode((b.pending ?? b.recipe).gs, true);
    if (changed) this.note(t('logRebake'));
  }

  private tap(e: PointerEvent): void {
    const b = this.bakery;
    if (!this.running || !b || b.stage !== 'serve') return;
    const box = this.canvas.getBoundingClientRect();
    b.bite(...this.r.ray(e.clientX - box.left, e.clientY - box.top));
  }

  private loop(now: number): void {
    const b = this.bakery;
    if (!this.running || !b) return;
    if (this.wrap.clientWidth !== this.fitW || this.wrap.clientHeight !== this.fitH) this.fit();
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    for (const ev of b.tick(dt)) this.apply(b, ev);
    this.jingle.update();
    this.audio.readLevel();
    this.r.frame(dt, b, this.audio.level);
    this.follow(dt);
    this.hudTick += dt;
    if (this.hudTick > 0.25) {
      this.hudTick = 0;
      this.drawHud(b);
    }
  }

  private apply(b: Bakery, ev: BakeEvent): void {
    this.jingle.event(ev);
    if (ev.type === 'stage') {
      this.jingle.stage(ev.stage);
      const r = b.recipe;
      const msg = LOG[ev.stage];
      if (msg) this.note(t(msg, { temp: r.temp, min: r.minutes }));
      if (ev.stage === 'cool' && r.bake > 1.45) this.note(t('logBurnt'));
      this.highlight(b, ev.stage);
    } else if (ev.type === 'ready') {
      this.greet.textContent = b.recipe.message || t('greeting');
      this.greet.classList.add('on');
      this.note(t('logReady'));
    } else if (ev.type === 'sweep') {
      this.greet.classList.remove('on');
    }
  }

  private note(text: string): void {
    this.logs.push(text);
    if (this.logs.length > 3) this.logs.shift();
    this.logEl.textContent = '';
    for (const l of this.logs) {
      const d = document.createElement('div');
      d.textContent = l;
      this.logEl.appendChild(d);
    }
  }

  /** the words, symbols and numbers that decided this stage glow while it runs */
  private highlight(b: Bakery, stage: Stage): void {
    const hue = HUE[stage];
    if (hue === undefined) return;
    for (const s of this.lit) s.classList.remove('on');
    this.lit = [];
    const col = `hsl(${hue} 85% 70%)`;
    for (const m of (b.pending ?? b.recipe).marks) {
      if (m.stage !== stage) continue;
      for (let i = m.g0; i < m.g1; i++) {
        const s = this.spans[i];
        if (!s) continue;
        s.style.setProperty('--c', col);
        s.classList.add('on', 'seen');
        this.lit.push(s);
      }
    }
    this.hlLast = this.lit[0] ?? this.hlLast;
  }

  private follow(dt: number): void {
    const s = this.hlLast;
    if (!s) return;
    const cv = this.codeview;
    const target = s.offsetTop - cv.clientHeight * 0.35;
    const next = cv.scrollTop + (target - cv.scrollTop) * Math.min(1, dt * 3);
    if (Math.abs(next - cv.scrollTop) > 0.5) cv.scrollTop = next;
  }

  private drawHud(b: Bakery): void {
    const r = b.recipe;
    const head = document.createElement('div');
    head.textContent = `${t(r.dough)} · ${t(r.shape)} ×${r.count}`;
    const meta = document.createElement('div');
    meta.className = 'meta';
    if (b.stage === 'bake' || b.stage === 'cool') meta.textContent = `${r.temp}° · ${clock(b.timer())}`;
    else if (b.stage === 'serve') meta.textContent = t('hudEat');
    this.hud.replaceChildren(head, meta);
  }
}
