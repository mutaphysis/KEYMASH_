// Play mode: runs the VM against the audio clock, feeds the renderer and the
// scrolling, highlighted code view.
import { VM } from '../lang/vm.js';
import { Renderer } from '../engine/render.js';
import { keyInfo } from '../lang/keys.js';

const SOUND = new Set(['note', 'drum', 'sfx', 'dtmf']);
const UI = new Set(['hl', 'log', 'gen', 'die', 'say']);
const LOOKAHEAD = 0.12;

export class Player {
  constructor(audio) {
    this.audio = audio;
    this.stage = document.getElementById('stage');
    this.wrap = document.getElementById('stageWrap');
    this.codeview = document.getElementById('codeview');
    this.hud = document.getElementById('hud');
    this.logEl = document.getElementById('log');
    this.boot = document.getElementById('boot');
    this.r = new Renderer(this.stage);
    this.running = false;
    this.queue = []; this.logs = [];
    this.hlPrev = new Map(); this.hlLast = null;
    new ResizeObserver(() => this.fit()).observe(this.wrap);
    this.stage.addEventListener('pointerdown', (e) => this.tap(e));
    this.loop = this.loop.bind(this);
  }

  fit() {
    const r = this.wrap.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    this.r.resize(r.width, r.height);
    if (this.vm) this.vm.setBounds(this.r.hw, this.r.hh);
  }

  buildCode(gs) {
    const cv = this.codeview; cv.textContent = '';
    const frag = document.createDocumentFragment();
    this.spans = gs.map((g) => {
      const s = document.createElement('span');
      s.textContent = g === '\r\n' ? '\n' : g;
      frag.appendChild(s); return s;
    });
    cv.appendChild(frag);
    cv.scrollTop = 0;
  }

  async start(src) {
    this.stop(true);
    this.src = src;
    this.audio.init(); this.audio.speechInit();
    this.fit();
    this.vm = new VM(src, { hw: this.r.hw, hh: this.r.hh });
    this.buildCode(this.vm.gs);
    this.r.reset();
    this.audio.newSession(); this.audio.setBpm(this.vm.bpm);
    this.queue = []; this.logs = []; this.hlPrev.clear(); this.hlLast = null; this.restartAt = 0;
    this.logEl.textContent = '';
    await this.bootSequence();
    this.running = true;
    this.nextTick = this.audio.now + 0.05;
    this.lastFrame = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
  }

  bootSequence() {
    const lines = [
      '> keymash --run program.mash',
      `> lexing ${this.vm.gs.length} glyphs ......... ok`,
      `> spawning ${this.vm.threads.length || 0} thread(s) ....... ok`,
      '> syntax errors: 0 (there are never errors)',
      '> ACCESS GRANTED',
    ];
    this.boot.classList.add('on'); this.boot.textContent = '';
    return new Promise((res) => {
      let i = 0;
      const step = () => {
        if (i >= lines.length) { setTimeout(() => { this.boot.classList.remove('on'); res(); }, 140); return; }
        this.boot.textContent += lines[i++] + '\n';
        try { this.audio.play({ type: 'sfx', kind: 'data', vel: 0.3, p: 1, pan: 0 }, this.audio.now, 0.125); } catch (e) {}
        setTimeout(step, 110);
      };
      step();
    });
  }

  stop(silent) {
    this.running = false;
    cancelAnimationFrame(this.raf);
    if (!silent) this.audio.stop();
    else this.audio.speechStop();
  }

  restart() { if (this.src !== undefined) this.start(this.src); }

  tap(e) {
    if (!this.running) return;
    const rect = this.stage.getBoundingClientRect();
    const [x, y] = this.r.toWorld(e.clientX - rect.left, e.clientY - rect.top);
    const hue = (x / this.r.hw * 120 + 200) % 360;
    this.r.handle({ type: 'particles', kind: 'burst', n: 30, x, y, color: { h: hue, s: 100, l: 65 } });
    this.r.handle({ type: 'shape', kind: 'ring', x, y, r: 16, grow: 4, life: 0.7, color: { h: hue, s: 100, l: 65 }, w: 3 });
    const deg = Math.round((x / this.r.hw + 1) * 5);
    const midi = 57 + [0, 3, 5, 7, 10][((deg % 5) + 5) % 5] + 12 * Math.floor(deg / 5) - (y > 0 ? 12 : 0);
    this.audio.play({ type: 'note', inst: 'bell', midi, dur: 2, vel: 0.6, pan: x / this.r.hw }, this.audio.now, 0.125);
  }

  loop(t) {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (t - this.lastFrame) / 1000); this.lastFrame = t;
    const now = this.audio.now;
    const vm = this.vm;

    if (this.nextTick < now - 0.25) this.nextTick = now + 0.02; // we were in the background: skip ahead
    let guard = 0;
    while (this.nextTick < now + LOOKAHEAD && guard++ < 16) {
      const tickDur = vm.tickDur;
      const bpmBefore = vm.bpm;
      const evs = vm.tick();
      for (const e of evs) {
        const when = this.nextTick + (e.dt || 0) * tickDur + (e.at || 0);
        if (SOUND.has(e.type)) this.audio.play(e, when, tickDur);
        else this.queue.push({ when, e });
      }
      if (vm.bpm !== bpmBefore) this.audio.setBpm(vm.bpm);
      this.nextTick += tickDur;
      if (vm.done && !this.restartAt) this.restartAt = now + 2;
    }
    if (this.restartAt && now > this.restartAt) { this.restart(); return; }

    // replay visual + ui events on time
    if (this.queue.length) {
      const keep = [];
      for (const q of this.queue) {
        if (q.when <= now) this.apply(q.e); else keep.push(q);
      }
      this.queue = keep.length > 4000 ? keep.slice(-4000) : keep;
    }

    const level = this.audio.readLevel();
    this.r.frame(dt, level, this.audio.bass || 0);
    this.follow(dt);
    this.hudTick = (this.hudTick || 0) + dt;
    if (this.hudTick > 0.1) { this.hudTick = 0; this.drawHud(level); }
  }

  apply(e) {
    if (!UI.has(e.type)) { this.r.handle(e); return; }
    switch (e.type) {
      case 'hl': this.highlight(e); break;
      case 'log': this.log(e.text); break;
      case 'say': this.audio.speak(e.text, e.pitch, e.rate); break;
      case 'gen': if (e.gen % 4 === 0) this.log(`t${e.th} :: generation ${e.gen} :: mutating…`); break;
      case 'die': this.log(`t${e.th} :: exited (0)`); break;
    }
  }

  highlight(e) {
    if (!this.spans) return;
    const prev = this.hlPrev.get(e.th);
    if (prev) for (let i = prev[0]; i < prev[1]; i++) { const s = this.spans[i]; if (s) s.classList.remove('on'); }
    const col = `hsl(${e.hue | 0} 100% 60%)`;
    for (let i = e.g0; i < e.g1; i++) {
      const s = this.spans[i]; if (!s) continue;
      s.style.setProperty('--c', col); s.classList.add('on', 'seen');
    }
    this.hlPrev.set(e.th, [e.g0, e.g1]);
    this.hlLast = this.spans[e.g0];
    this.activity = this.activity || new Map(); this.activity.set(e.th, performance.now());
  }

  follow(dt) {
    const s = this.hlLast; if (!s) return;
    const cv = this.codeview;
    const target = s.offsetTop - cv.clientHeight * 0.35;
    const cur = cv.scrollTop;
    const next = cur + (target - cur) * Math.min(1, dt * 5);
    if (Math.abs(next - cur) > 0.5) cv.scrollTop = next;
  }

  log(text) {
    this.logs.push(text); if (this.logs.length > 4) this.logs.shift();
    this.logEl.innerHTML = '';
    for (const l of this.logs) { const d = document.createElement('div'); d.textContent = l; this.logEl.appendChild(d); }
  }

  drawHud(level) {
    const vm = this.vm; if (!vm) return;
    const nowMs = performance.now();
    const dots = vm.threads.map((th) => {
      const act = this.activity && this.activity.get(th.id);
      const hot = act && nowMs - act < 160;
      return `<span class="dot" style="background:hsl(${th.uiHue | 0} 100% 60%);opacity:${th.alive ? (hot ? 1 : 0.35) : 0.1};transform:scale(${hot ? 1.35 : 1})"></span>`;
    }).join('');
    const cpu = Math.min(99, 40 + Math.round(level * 160));
    this.hud.innerHTML = `${dots}<br>TICK ${String(vm.tickN).padStart(5, '0')} · ${Math.round(vm.bpm)} BPM · CPU ${cpu}%`;
  }
}

export { keyInfo };
