// Play mode: runs the VM against the audio clock, feeds the renderer and the
// scrolling, highlighted code view.
import { VM, MAX_BPM } from '../../lang/vm';
import { Renderer } from './render';
import type { AudioEngine } from '../../engine/audio';
import { isSound } from '../../lang/types';
import type { VMEvent, EventOf } from '../../lang/types';
import { $ } from '../../ui/dom';
import { VERSION_LABEL } from '../../version';
import { t } from './messages';

type UIEvent = EventOf<'hl' | 'log' | 'gen' | 'die' | 'say'>;
const isUI = (e: VMEvent): e is UIEvent => e.type === 'hl' || e.type === 'log' || e.type === 'gen' || e.type === 'die' || e.type === 'say';
const LOOKAHEAD = 0.12;

export class Player {
  audio: AudioEngine;
  stage = $<HTMLCanvasElement>('stage');
  wrap = $('stageWrap');
  codeview = $('codeview');
  hud = $('hud');
  logEl = $('log');
  boot = $('boot');
  r: Renderer;
  vm: VM | null = null;
  src: string | undefined;
  running = false;
  queue: { when: number; e: VMEvent }[] = [];
  logs: string[] = [];
  spans: HTMLSpanElement[] = [];
  hlPrev = new Map<number, [number, number]>();
  hlLast: HTMLSpanElement | null = null;
  activity = new Map<number, number>();
  taps: number[] = [];
  tapBpm = 0;
  lastAudio = -1;
  stall = 0;
  offset = 0;
  raf = 0;
  nextTick = 0;
  lastFrame = 0;
  restartAt = 0;
  hudTick = 0;

  constructor(audio: AudioEngine) {
    this.audio = audio;
    this.r = new Renderer(this.stage);
    new ResizeObserver(() => {
      if (this.active) this.fit();
    }).observe(this.wrap); // the stage is shared: only the active player sizes it // the stage is shared with PETRI
    this.stage.addEventListener('pointerdown', (e) => this.tap(e));
    this.loop = this.loop.bind(this);
  }

  /** true from start() until stop(): this player owns the shared stage */
  active = false;
  private fitW = 0;
  private fitH = 0;

  fit(): void {
    // layout size, not getBoundingClientRect: the mode-switch glitch animation skews and scales the app
    const r = { width: this.wrap.clientWidth, height: this.wrap.clientHeight };
    if (r.width < 2 || r.height < 2) return;
    this.fitW = this.wrap.clientWidth;
    this.fitH = this.wrap.clientHeight;
    this.r.resize(r.width, r.height);
    this.r.reserveBottom = r.height - this.logEl.offsetTop + 4 * 16; // log grows upwards to 4 lines
    if (this.vm) this.vm.setBounds(this.r.hw, this.r.hh);
  }

  buildCode(gs: string[], keepScroll = false): void {
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
  }

  // live coding: swap in a new program without stopping the clock, the picture or the sound
  hotSwap(src: string): void {
    if (!this.running || src === this.src) return;
    this.src = src;
    const old = this.vm;
    this.vm = new VM(src, { hw: this.r.hw, hh: this.r.hh });
    this.vm.tickN = Math.max(1, old ? old.tickN : 1); // skip the boot log, keep the harmony moving
    if (old) {
      this.vm.time = old.time;
      this.vm.cooldowns = old.cooldowns;
    } // editing doesn't reset spell cooldowns
    this.buildCode(this.vm.gs, true);
    this.queue = this.queue.filter((q) => q.e.type !== 'hl');
    this.hlPrev.clear();
    this.hlLast = null;
    this.restartAt = 0;
    if (this.tapBpm) this.vm.baseBpm = this.vm.bpm = this.tapBpm; // a tapped tempo survives edits
    this.audio.setBpm(this.vm.bpm);
    this.log('HOT-SWAP :: ' + t('runSummary', { glyphs: this.vm.gs.length, threads: this.vm.threads.length }));
    this.r.handle({ type: 'glitch', dt: 0, amt: 0.25, dur: 0.12 });
  }

  async start(src: string): Promise<void> {
    this.stop(true);
    this.active = true;
    this.src = src;
    this.audio.init();
    this.audio.speechInit();
    this.fit();
    this.vm = new VM(src, { hw: this.r.hw, hh: this.r.hh });
    this.buildCode(this.vm.gs);
    this.r.reset();
    this.taps = [];
    this.tapBpm = 0;
    this.audio.newSession();
    this.audio.setBpm(this.vm.bpm);
    this.queue = [];
    this.logs = [];
    this.hlPrev.clear();
    this.hlLast = null;
    this.restartAt = 0;
    this.logEl.textContent = '';
    await this.bootSequence();
    this.running = true;
    this.lastAudio = -1;
    this.stall = 0;
    this.offset = 0;
    this.nextTick = this.audio.now + 0.05;
    this.lastFrame = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
  }

  bootSequence(): Promise<void> {
    const vm = this.vm!;
    const lines = [
      `> keymash ${VERSION_LABEL} --run program.mash`,
      t('bootLex', { n: vm.gs.length }),
      t('bootSpawn', { n: vm.threads.length || 0 }),
      t('bootErrors'),
      t('bootGranted'),
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
          }, 140);
          return;
        }
        this.boot.textContent += lines[i++] + '\n';
        try {
          this.audio.play({ type: 'sfx', dt: 0, kind: 'data', vel: 0.3, p: 1, pan: 0 }, this.audio.now, 0.125);
        } catch (e) {}
        setTimeout(step, 110);
      };
      step();
    });
  }

  stop(silent = false): void {
    this.running = false;
    this.active = false;
    cancelAnimationFrame(this.raf);
    if (!silent) this.audio.stop();
    else this.audio.speechStop();
  }

  restart(): void {
    if (this.src !== undefined) this.start(this.src);
  }

  tap(e: PointerEvent): void {
    if (!this.running) return;
    this.tapTempo();
    const rect = this.stage.getBoundingClientRect();
    const [x, y] = this.r.toWorld(e.clientX - rect.left, e.clientY - rect.top);
    const hue = ((x / this.r.hw) * 120 + 200) % 360;
    this.r.handle({ type: 'particles', dt: 0, kind: 'burst', n: 30, x, y, color: { h: hue, s: 100, l: 65 } });
    this.r.handle({
      type: 'shape',
      dt: 0,
      kind: 'ring',
      x,
      y,
      r: 16,
      rot: 0,
      fill: false,
      grow: 4,
      life: 0.7,
      color: { h: hue, s: 100, l: 65 },
      w: 3,
    });
    const deg = Math.round((x / this.r.hw + 1) * 5);
    const midi = 57 + [0, 3, 5, 7, 10][((deg % 5) + 5) % 5] + 12 * Math.floor(deg / 5) - (y > 0 ? 12 : 0);
    this.audio.play(
      { type: 'note', dt: 0, inst: 'bell', midi, dur: 2, vel: 0.6, glide: 0, vib: 0, echo: 0, pan: x / this.r.hw },
      this.audio.now,
      0.125,
    );
  }

  /**
   * The program runs on the audio clock. If that clock stops (Safari interrupts or suspends the
   * AudioContext now and then), carry on with wall-clock time so the program never freezes;
   * sound is skipped until the context is back.
   */
  clock(dt: number): number {
    const a = this.audio.now;
    if (a === this.lastAudio) {
      this.stall += dt;
      if (this.stall > 0.25) {
        this.offset += dt;
        this.audio.revive();
      }
    } else {
      this.stall = 0;
      this.lastAudio = a;
    }
    return a + this.offset;
  }
  get stalled(): boolean {
    return this.stall > 0.25;
  }

  /** Four taps in a steady rhythm on the stage set the tempo. No button, no setting. */
  tapTempo(): void {
    const now = performance.now() / 1000;
    this.taps.push(now);
    if (this.taps.length > 4) this.taps.shift();
    if (this.taps.length < 4 || !this.vm) return;
    const gaps = [1, 2, 3].map((i) => this.taps[i]! - this.taps[i - 1]!);
    const mean = (gaps[0]! + gaps[1]! + gaps[2]!) / 3;
    if (mean < 0.3 || mean > 1 || gaps.some((g) => Math.abs(g - mean) > mean * 0.2)) return;
    this.tapBpm = Math.min(MAX_BPM, Math.round(60 / mean));
    this.vm.baseBpm = this.vm.bpm = this.tapBpm;
    this.audio.setBpm(this.tapBpm);
    this.log(t('tapTempo', { bpm: this.tapBpm }));
    this.taps = [];
  }

  loop(t: number): void {
    if (!this.running || !this.vm) return;
    if (this.wrap.clientWidth !== this.fitW || this.wrap.clientHeight !== this.fitH) this.fit();
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (t - this.lastFrame) / 1000);
    this.lastFrame = t;
    const now = this.clock(dt);
    const vm = this.vm;

    if (this.nextTick < now - 0.25) this.nextTick = now + 0.02; // we were in the background: skip ahead
    let guard = 0;
    while (this.nextTick < now + LOOKAHEAD && guard++ < 16) {
      const tickDur = vm.tickDur;
      const bpmBefore = vm.bpm;
      const evs = vm.tick();
      for (const e of evs) {
        const when = this.nextTick + (e.dt || 0) * tickDur + (e.at || 0);
        if (isSound(e)) {
          if (!this.stalled) this.audio.play(e, when - this.offset, tickDur);
        } else this.queue.push({ when, e });
      }
      if (vm.bpm !== bpmBefore) this.audio.setBpm(vm.bpm);
      this.nextTick += tickDur;
      if (vm.done && !this.restartAt) this.restartAt = now + 2;
    }
    if (this.restartAt && now > this.restartAt) {
      this.restart();
      return;
    }

    // replay visual + ui events on time
    if (this.queue.length) {
      const keep: { when: number; e: VMEvent }[] = [];
      for (const q of this.queue) {
        if (q.when <= now) this.apply(q.e);
        else keep.push(q);
      }
      this.queue = keep.length > 4000 ? keep.slice(-4000) : keep;
    }

    const level = this.audio.readLevel();
    this.r.frame(dt, level, this.audio.bass || 0);
    this.follow(dt);
    this.hudTick = (this.hudTick || 0) + dt;
    if (this.hudTick > 0.1) {
      this.hudTick = 0;
      this.drawHud(level);
    }
  }

  apply(e: VMEvent): void {
    if (!isUI(e)) {
      this.r.handle(e);
      return;
    }
    switch (e.type) {
      case 'hl':
        this.highlight(e);
        break;
      case 'log':
        this.log(e.text);
        break;
      case 'say':
        this.audio.speak(e.text, e.pitch, e.rate, e.pan ?? 0);
        break;
      case 'gen':
        if (e.gen % 4 === 0) this.log(t('generation', { th: String(e.th), gen: e.gen }));
        break;
      case 'die':
        this.log(t('exited', { th: String(e.th) }));
        break;
    }
  }

  highlight(e: EventOf<'hl'>): void {
    if (!this.spans) return;
    const th = e.th ?? -1;
    const prev = this.hlPrev.get(th);
    if (prev)
      for (let i = prev[0]; i < prev[1]; i++) {
        const s = this.spans[i];
        if (s) s.classList.remove('on');
      }
    const col = `hsl(${e.hue | 0} 100% 60%)`;
    for (let i = e.g0; i < e.g1; i++) {
      const s = this.spans[i];
      if (!s) continue;
      s.style.setProperty('--c', col);
      s.classList.add('on', 'seen');
    }
    this.hlPrev.set(th, [e.g0, e.g1]);
    this.hlLast = this.spans[e.g0] ?? null;
    this.activity.set(e.th ?? -1, performance.now());
  }

  follow(dt: number): void {
    const s = this.hlLast;
    if (!s) return;
    const cv = this.codeview;
    const target = s.offsetTop - cv.clientHeight * 0.35;
    const cur = cv.scrollTop;
    const next = cur + (target - cur) * Math.min(1, dt * 5);
    if (Math.abs(next - cur) > 0.5) cv.scrollTop = next;
  }

  log(text: string): void {
    this.logs.push(text);
    if (this.logs.length > 4) this.logs.shift();
    this.logEl.innerHTML = '';
    for (const l of this.logs) {
      const d = document.createElement('div');
      d.textContent = l;
      this.logEl.appendChild(d);
    }
  }

  drawHud(level: number): void {
    const vm = this.vm;
    if (!vm) return;
    const nowMs = performance.now();
    const dots = vm.threads
      .map((th) => {
        const act = this.activity.get(th.id);
        const hot = act && nowMs - act < 160;
        return `<span class="dot" style="background:hsl(${th.uiHue | 0} 100% 60%);opacity:${th.alive ? (hot ? 1 : 0.35) : 0.1};transform:scale(${hot ? 1.35 : 1})"></span>`;
      })
      .join('');
    const cpu = Math.min(99, 40 + Math.round(level * 160));
    this.hud.innerHTML = `${dots}<br>TICK ${String(vm.tickN).padStart(5, '0')} · ${Math.round(vm.bpm)} BPM · CPU ${cpu}%`;
  }
}
