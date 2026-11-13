// PETRI_ play mode: runs the culture, draws the dish, plays the ambient score, keeps the
// code view in step with what the feeder is reading, and writes field notes.
import { Petri } from './culture';
import type { CultureEvent } from './culture';
import { MicroRenderer } from './render';
import { Ambient } from './ambient';
import type { AudioEngine } from '../engine/audio';
import type { SimEvent } from './sim';
import { $ } from '../ui/dom';
import { VERSION_LABEL } from '../version';

const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class MicroPlayer {
  audio: AudioEngine;
  amb: Ambient;
  stage = $<HTMLCanvasElement>('stage');
  wrap = $('stageWrap');
  codeview = $('codeview');
  hud = $('hud');
  logEl = $('log');
  boot = $('boot');
  r: MicroRenderer;
  petri: Petri | null = null;
  src: string | undefined;
  running = false;
  spans: HTMLSpanElement[] = [];
  hlPrev = new Map<number, [number, number]>();
  hlLast: HTMLSpanElement | null = null;
  logs: string[] = [];
  private lastNote = 0; private records = { gen: 1 }; private firsts = new Set<string>();
  raf = 0; lastFrame = 0; hudTick = 0;

  constructor(audio: AudioEngine) {
    this.audio = audio;
    this.amb = new Ambient(audio);
    this.r = new MicroRenderer(this.stage);
    new ResizeObserver(() => { if (this.running) this.fit(); }).observe(this.wrap);
    this.stage.addEventListener('pointerdown', (e) => this.tap(e));
    this.loop = this.loop.bind(this);
  }

  fit(): void {
    const b = this.wrap.getBoundingClientRect();
    if (b.width < 2 || b.height < 2) return;
    this.r.reserveBottom = 76; // the play buttons
    this.r.resize(b.width, b.height);
  }

  buildCode(gs: string[], keepScroll = false): void {
    const cv = this.codeview; const top = cv.scrollTop; cv.textContent = '';
    const frag = document.createDocumentFragment();
    this.spans = gs.map((g) => { const s = document.createElement('span'); s.textContent = g === '\r\n' ? '\n' : g; frag.appendChild(s); return s; });
    cv.appendChild(frag);
    cv.scrollTop = keepScroll ? top : 0;
  }

  async start(src: string): Promise<void> {
    this.stop(true);
    this.src = src;
    this.audio.init();
    this.fit();
    this.petri = new Petri(src);
    this.buildCode(this.petri.culture.gs);
    this.r.reset();
    this.hlPrev.clear(); this.hlLast = null; this.logs = []; this.logEl.textContent = '';
    this.firsts.clear(); this.records = { gen: 1 }; this.lastNote = 0;
    await this.bootSequence();
    this.amb.start();
    this.running = true;
    this.lastFrame = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
  }

  private bootSequence(): Promise<void> {
    const p = this.petri!;
    const sp = p.species.length;
    const lines = [
      `petri ${VERSION_LABEL}`,
      'preparing culture medium …… ok',
      `reading ${p.culture.lines.length} line${p.culture.lines.length === 1 ? '' : 's'} of genome …… ok`,
      sp ? `inoculating ${sp} species` : 'no species — just weather and food',
      'focusing',
    ];
    this.boot.classList.add('on'); this.boot.textContent = '';
    return new Promise<void>((res) => {
      let i = 0;
      const step = () => {
        if (i >= lines.length) { setTimeout(() => { this.boot.classList.remove('on'); res(); }, 260); return; }
        this.boot.textContent += lines[i++] + '\n';
        setTimeout(step, 150);
      };
      step();
    });
  }

  stop(silent = false): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.amb.stop();
    if (!silent) this.audio.stop();
  }

  restart(): void { if (this.src !== undefined) void this.start(this.src); }

  hotSwap(src: string): void {
    if (!this.running || !this.petri || src === this.src) return;
    this.src = src;
    this.petri.swap(src);
    this.buildCode(this.petri.culture.gs, true);
    this.hlPrev.clear(); this.hlLast = null;
    this.note(`${clock(this.petri.world.time)} · genome edited — ${this.petri.species.length} species`, true);
  }

  tap(e: PointerEvent): void {
    if (!this.running || !this.petri) return;
    const b = this.stage.getBoundingClientRect();
    const [x, y] = this.r.toWorld(e.clientX - b.left, e.clientY - b.top);
    if (Math.hypot(x, y) > 420) return;
    this.petri.world.addFood(x, y, 5, 'algae', 18);
    this.r.ripple(x, y, 4, 40, 1.4, 100, 0.5);
    this.amb.touch(x);
  }

  private loop(t: number): void {
    if (!this.running || !this.petri) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (t - this.lastFrame) / 1000); this.lastFrame = t;
    for (const ev of this.petri.tick(dt)) this.apply(ev);
    this.amb.update(dt);
    this.audio.readLevel();
    this.r.frame(dt, this.petri.world, this.amb.activity);
    this.follow(dt);
    this.hudTick += dt;
    if (this.hudTick > 0.3) { this.hudTick = 0; this.drawHud(); }
  }

  private apply(ev: CultureEvent): void {
    if (ev.type === 'read') { this.highlight(ev.read.line, ev.read.g0, ev.read.g1, ev.read.hue); return; }
    if (ev.type === 'note') { this.r.note(ev.note); this.note(`${clock(this.petri!.world.time)} · “${ev.note.text}”`); return; }
    this.r.handle(ev);
    this.amb.event(ev);
    this.fieldNote(ev);
  }

  /** a few interesting moments become field notes; most of life goes unrecorded */
  private fieldNote(ev: SimEvent): void {
    const t = clock(this.petri!.world.time);
    const once = (key: string, text: string) => { if (!this.firsts.has(key)) { this.firsts.add(key); this.note(`${t} · ${text}`, true); } };
    switch (ev.type) {
      case 'first': this.note(`${t} · ${ev.sp.name} appears`, true); break;
      case 'divide':
        once('divide:' + ev.sp.seed, `${ev.sp.name} divides for the first time`);
        if (ev.gen > this.records.gen && ev.gen % 3 === 0) { this.records.gen = ev.gen; this.note(`${t} · ${ev.sp.name} reaches generation ${ev.gen}`); }
        break;
      case 'engulf': once('engulf:' + ev.pred.seed + ':' + ev.prey.seed, `${ev.pred.name} engulfs ${ev.prey.name}`); break;
      case 'bond': once('bond:' + ev.a.seed + ':' + ev.b.seed, `${ev.a.name} and ${ev.b.name} share food`); break;
      case 'toxic': once('toxic:' + ev.sp.seed, `${ev.sp.name} ate something toxic`); break;
      case 'hatch': once('hatch:' + ev.sp.seed, `spores of ${ev.sp.name} hatch`); break;
      case 'die': if (ev.cause === 'starved') once('starve:' + ev.sp.seed, `${ev.sp.name} starves`); else if (ev.cause === 'old') once('old:' + ev.sp.seed, `${ev.sp.name} dies of old age`); else if (ev.cause === 'toxin') once('toxin:' + ev.sp.seed, `${ev.sp.name} poisoned`); break;
      case 'bloom': if (this.petri!.world.time - this.lastNote > 6) this.note(`${t} · algae bloom`); break;
      case 'extinct': this.note(`${t} · ${ev.sp.name} is extinct`, true); break;
      default: break;
    }
  }

  private note(text: string, force = false): void {
    const now = this.petri ? this.petri.world.time : 0;
    if (!force && now - this.lastNote < 1.5) return;
    this.lastNote = now;
    this.logs.push(text); if (this.logs.length > 3) this.logs.shift();
    this.logEl.innerHTML = '';
    for (const l of this.logs) { const d = document.createElement('div'); d.textContent = l; this.logEl.appendChild(d); }
  }

  private highlight(line: number, g0: number, g1: number, hue: number): void {
    const prev = this.hlPrev.get(line);
    if (prev) for (let i = prev[0]; i < prev[1]; i++) this.spans[i]?.classList.remove('on');
    const col = `hsl(${hue | 0} 80% 70%)`;
    for (let i = g0; i < g1; i++) { const s = this.spans[i]; if (!s) continue; s.style.setProperty('--c', col); s.classList.add('on', 'seen'); }
    this.hlPrev.set(line, [g0, g1]);
    this.hlLast = this.spans[g0] ?? null;
  }

  private follow(dt: number): void {
    const s = this.hlLast; if (!s) return;
    const cv = this.codeview;
    const target = s.offsetTop - cv.clientHeight * 0.35;
    const next = cv.scrollTop + (target - cv.scrollTop) * Math.min(1, dt * 3);
    if (Math.abs(next - cv.scrollTop) > 0.5) cv.scrollTop = next;
  }

  /** census: each species with its colour and head count */
  private drawHud(): void {
    const p = this.petri; if (!p) return;
    const W = p.world;
    const rows = p.species.map((sp) => ({ sp, n: W.population(sp) })).sort((a, b) => b.n - a.n).slice(0, 5);
    const html = rows.map(({ sp, n }) =>
      `<div class="sp${n ? '' : ' gone'}"><span class="dot" style="background:hsl(${sp.hue | 0} 70% 62%)"></span><i>${sp.name.replace(/</g, '')}</i> <b>${n}</b></div>`).join('');
    this.hud.innerHTML = `${html}<div class="meta">${clock(W.time)} · ${W.cells.length} cells · ${W.food.length} food${W.temp < 0.85 ? ' · cold' : W.temp > 1.15 ? ' · warm' : ''}</div>`;
  }
}
