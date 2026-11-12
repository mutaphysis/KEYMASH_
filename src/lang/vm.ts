// KEYMASH virtual machine. Pure: no DOM, no audio. tick() -> timed events.
import { lex, fmtNum } from './lexer';
import type { Token, WordTok, SymTok } from './lexer';
import { keyInfo, adjacent, EMOJI_POWERS, stripAccents } from './keys';
import type { KeyInfo } from './keys';
import type { Color, Point, Op, Instrument, DrumKind, SfxKind, ShapeKind, ParticleKind, TextStyle, VMEvent, EvInput, EvBase } from './types';

export type ScaleName = 'penta' | 'major' | 'minor' | 'blues' | 'spooky' | 'japan';

interface NoteOpts { inst?: Instrument; oct?: number; dur?: number; vel?: number; glide?: number; vib?: number; echo?: number; free?: boolean }
interface ShapeOpts { x?: number; y?: number; rot?: number; color?: Color; dl?: number; fill?: boolean; w?: number; life?: number; grow?: number; n?: number }
interface ParticleOpts { x?: number; y?: number; color?: Color; ch?: string; spread?: number }
interface TextOpts { x?: number; y?: number; size?: number; style?: TextStyle; color?: Color }
interface CurveOpts { w?: number; dur?: number; dl?: number; move?: boolean }
interface ThreadOpts { id?: number; pairs?: Map<number, number>; pc?: number; x?: number; y?: number; ang?: number; hue?: number; octave?: number; inst?: Instrument; pan?: number; speed?: number; child?: boolean; runs?: number }
interface Loop { start: number; left: number; close?: number }

/** One step of a letter chunk: a key, possibly held (n > 1), possibly the start of a roll. */
export interface Step { ch: string; g0: number; g1: number; n: number; key: KeyInfo; big: boolean; roll?: { len: number; dir: number; keys: KeyInfo[] } }

export function hash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
export function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SCALES: Record<ScaleName, number[]> = {
  penta: [0, 3, 5, 7, 10],
  major: [0, 2, 4, 7, 9],
  minor: [0, 2, 3, 5, 7, 8, 10],
  blues: [0, 3, 5, 6, 7, 10],
  spooky: [0, 1, 4, 6, 7, 10],
  japan: [0, 1, 5, 7, 8],
};
const PROGRESSION = [0, 5, 3, -2];
const INSTRUMENTS: Instrument[] = ['pluck', 'bass', 'bell', 'chip', 'lead', 'pad', 'organ', 'piano'];
const MAX_THREADS = 12;
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

const HACK_LINES = [
  'ACCESS GRANTED', 'MAINFRAME BREACHED', 'FIREWALL: LOL', 'DOWNLOADING MORE RAM',
  'ROOT ACCESS: GOOD BOY', 'HACKING THE PLANET', 'BYPASSING CAT DEFENSES', 'ENCRYPTING BONES',
  'I\'M IN.', 'SNIFFING PACKETS 🐽', 'TREAT.EXE INSTALLED', 'PASSWORD: ********',
  'SUDO MAKE ME A SANDWICH', 'TRACE BLOCKED', 'UPLOADING BARK.MP3', 'NEURAL LINK ESTABLISHED',
  'COMPILING… 0 ERRORS', 'KERNEL PANIC (JUST KIDDING)', 'ENHANCE!', 'SQUIRREL.DLL LOADED',
];
const FORMULAS: { f: (x: number, A: number, k: number) => number; s: (A: number, k: number) => string }[] = [
  { f: (x, A, k) => A * Math.sin(k * x), s: (A, k) => `y = ${A}·sin(${k}x)` },
  { f: (x, A, k) => A * Math.cos(k * x) * Math.sin(x / 90), s: (A, k) => `y = ${A}·cos(${k}x)·sin(x/90)` },
  { f: (x, A, k) => x * x / (A * 4), s: (A) => `y = x² / ${A * 4}` },
  { f: (x, A, k) => (Math.abs(x) < 1e-6 ? A : A * Math.sin(k * x) / (k * x)), s: (A, k) => `y = ${A}·sin(${k}x)/(${k}x)` },
  { f: (x, A, k) => Math.max(-A * 3, Math.min(A * 3, A * 0.3 * Math.tan(k * x))), s: (A, k) => `y = ${(A * 0.3).toFixed(0)}·tan(${k}x)` },
  { f: (x, A, k) => Math.abs(A * Math.sin(k * x)), s: (A, k) => `y = |${A}·sin(${k}x)|` },
  { f: (x, A, k) => A * 2 * Math.exp(-(x * x) / 20000), s: (A) => `y = ${A * 2}·e^(−x²/20000)` },
  { f: (x, A, k) => A * Math.sin(k * x) + A * 0.5 * Math.sin(k * 3.1 * x), s: (A, k) => `y = ${A}·sin(${k}x) + ${A / 2}·sin(${(k * 3.1).toFixed(3)}x)` },
];

// the effect library that mash chunks summon (output only — nothing here is typed by name)
export const SPELLS: Op[] = [
  'circle', 'square', 'tri', 'star', 'heart', 'flower', 'ring', 'spiral', 'tree', 'sun', 'moon', 'grid', 'poly', 'snowflake',
  'sin', 'cos', 'tan', 'wave', 'rose', 'zigzag', 'bounce', 'dna', 'knot', 'scribble', 'math', 'math',
  'rainbow', 'invert', 'fire', 'rain', 'snow', 'confetti', 'boom', 'fireworks', 'bubbles', 'smoke', 'sparkle', 'stars', 'money',
  'glitch', 'spin', 'zoom', 'shrink', 'shake', 'flip', 'mirror', 'kaleido', 'tunnel', 'warp', 'tilt', 'calm',
  'beep', 'boop', 'bassdrop', 'laser', 'siren', 'chord', 'arp', 'chime',
  'i_piano', 'i_organ', 'i_bell', 'i_bass', 'i_chip', 'i_pad', 'i_robot', 'i_pluck', 'i_lead',
  'fast', 'slow', 'major', 'minor', 'blues', 'spooky', 'japan',
  'hack', 'access', 'mainframe', 'virus', 'download', 'matrix', 'hack', 'hack',
  'dog', 'dog', 'paws', 'cat', 'cow', 'duck', 'pig', 'bird', 'fish', 'dino', 'dragon', 'unicorn', 'ghost', 'alien', 'robot',
  'rocket', 'ball', 'bone', 'squirrel', 'poop', 'pizza', 'cake', 'banana', 'car', 'train', 'fork', 'chaos',
];

let THREAD_ID = 0;

export class Thread {
  id: number; vm: VM; toks: Token[]; start: number; end: number; pairs: Map<number, number>;
  pc: number; sub: number; x: number; y: number; ang: number; hue: number; sat: number; lit: number; uiHue: number;
  octave: number; inst: Instrument; pan: number; voicePitch: number; voiceRate: number;
  arg: number | null; loops: Loop[]; visits: Map<number, number>;
  gen: number; speed: number; acc: number; wait: number; alive: boolean; child: boolean; runs: number;
  rainbow: boolean; size: number; lastFn: (() => void) | null;
  forceDeg: number | null = null; paw: Point | null = null;

  constructor(vm: VM, toks: Token[], start: number, end: number, opts: ThreadOpts = {}) {
    this.id = opts.id ?? THREAD_ID++;
    this.vm = vm; this.toks = toks; this.start = start; this.end = end;
    this.pairs = opts.pairs || new Map();
    this.pc = opts.pc ?? start; this.sub = 0;
    const r = vm.rng;
    this.x = opts.x ?? (r() - 0.5) * vm.hw; this.y = opts.y ?? (r() - 0.5) * vm.hh;
    this.ang = opts.ang ?? r() * 360;
    this.hue = opts.hue ?? (this.id * 137.5 + vm.seed % 360) % 360;
    this.sat = 90; this.lit = 60;
    this.uiHue = (this.id * 137.5 + 120) % 360;
    this.octave = opts.octave ?? 0;
    this.inst = opts.inst ?? INSTRUMENTS[this.id % INSTRUMENTS.length]!;
    this.pan = opts.pan ?? (((this.id * 0.618) % 1) * 1.4 - 0.7);
    this.voicePitch = 0.5 + r() * 1.3; this.voiceRate = 0.85 + r() * 0.5;
    this.arg = null; this.loops = []; this.visits = new Map();
    this.gen = 0; this.speed = opts.speed ?? 1; this.acc = 0; this.wait = 0;
    this.alive = true; this.child = !!opts.child; this.runs = opts.runs ?? Infinity;
    this.rainbow = false; this.size = 1; this.lastFn = null;
  }
}

export class VM {
  src: string; gs: string[]; lines: Token[][]; seed: number; rng: () => number;
  hw: number; hh: number; bpm: number; tickN: number; scale: ScaleName; root: number;
  threads: Thread[]; ev: VMEvent[]; curDt: number; done: boolean; lineThreads: number;
  private plans = new WeakMap<WordTok, Step[]>();

  constructor(src: unknown, opts: { hw?: number; hh?: number; seed?: number } = {}) {
    this.src = String(src ?? '');
    const L = lex(this.src);
    this.gs = L.gs; this.lines = L.lines;
    this.seed = opts.seed ?? hash(this.src);
    this.rng = mulberry32(this.seed);
    this.hw = opts.hw ?? 500; this.hh = opts.hh ?? 500;
    this.bpm = 120; this.tickN = 0; this.scale = 'penta'; this.root = 57;
    this.threads = []; this.ev = []; this.curDt = 0; this.done = false;
    THREAD_ID = 0;
    for (const toks of this.lines) {
      if (!toks.some((t) => t.t !== 'space')) continue;
      const pairs = matchBrackets(toks);
      this.threads.push(new Thread(this, toks, 0, toks.length, { pairs }));
    }
    this.lineThreads = this.threads.length;
  }

  get tickDur() { return 60 / this.bpm / 4; }
  setBounds(hw: number, hh: number): void { this.hw = Math.max(50, hw); this.hh = Math.max(50, hh); }
  get transpose(): number { return PROGRESSION[Math.floor(this.tickN / 32) % PROGRESSION.length]!; }
  r() { return this.rng(); }
  pick<T>(a: readonly T[]): T { return a[Math.floor(this.rng() * a.length)]!; }

  tick(): VMEvent[] {
    this.ev = [];
    if (this.tickN === 0) this.boot();
    const list = this.threads.slice();
    for (const th of list) {
      try { this.runThread(th); } catch (e) {
        // the language has no errors. if the VM trips, the thread just glitches and moves on.
        th.pc++; th.sub = 0;
        this.emit({ type: 'glitch', amt: 0.6, dur: 0.3 }, th);
        this.emit({ type: 'log', text: `!! SEGFAULT IN THREAD ${th.id} — IGNORED LIKE A PRO` }, th);
      }
    }
    this.threads = this.threads.filter((t) => t.alive || !t.child);
    if (this.threads.length && this.threads.every((t) => !t.alive)) this.done = true;
    this.tickN++;
    return this.ev;
  }

  boot() {
    this.emit({ type: 'log', text: `KEYMASH v1.0 :: ${this.gs.length} glyphs :: ${this.threads.length} thread(s) :: 0 errors` });
  }

  emit<E extends EvInput>(e: E, th?: Thread): E & EvBase {
    const ev = e as E & { dt: number; th?: number; pan?: number };
    ev.dt = this.curDt;
    if (th) { ev.th = th.id; if (ev.pan === undefined) ev.pan = th.pan; }
    this.ev.push(ev as unknown as VMEvent);
    return ev;
  }

  runThread(th: Thread) {
    if (!th.alive) return;
    if (th.wait > 0) { th.wait--; return; }
    th.acc += th.speed;
    const total = Math.floor(th.acc);
    let n = 0;
    while (th.acc >= 1 && th.alive && th.wait === 0) {
      this.curDt = total > 1 ? n / total : 0;
      th.acc -= 1; this.step(th); n++;
    }
    this.curDt = 0;
  }

  step(th: Thread) {
    for (let guard = 0; guard < 48; guard++) {
      if (th.pc >= th.end || th.pc < th.start) { if (!this.wrap(th)) return; continue; }
      const tok = th.toks[th.pc]!;
      if (this.exec(th, tok)) return;
    }
  }

  wrap(th: Thread) {
    if (th.child) {
      th.runs--;
      if (th.runs <= 0) { th.alive = false; this.emit({ type: 'die' }, th); return false; }
    }
    th.pc = th.start; th.sub = 0; th.gen++; th.visits.clear(); th.loops.length = 0;
    th.hue = (th.hue + 23) % 360;
    th.ang += 11;
    th.speed = 1 + (th.speed - 1) * 0.5; // zoomies wear off
    th.size = 1 + (th.size - 1) * 0.5;
    this.emit({ type: 'gen', gen: th.gen }, th);
    return true;
  }

  hl(th: Thread, g0: number, g1: number): void { this.emit({ type: 'hl', g0, g1, hue: th.uiHue }, th); }

  takeArg(th: Thread, def: number, lo = -Infinity, hi = Infinity): number {
    const v = th.arg; th.arg = null;
    if (v === null || !Number.isFinite(v)) return def;
    return Math.max(lo, Math.min(hi, v));
  }

  col(th: Thread, dl = 0, ds = 0): Color {
    if (th.rainbow) th.hue = (th.hue + 29) % 360;
    return { h: th.hue, s: Math.max(0, Math.min(100, th.sat + ds)), l: Math.max(5, Math.min(97, th.lit + dl)) };
  }

  // ---- music helpers ----
  midi(th: Thread, deg: number, oct = 0): number {
    const sc = SCALES[this.scale] || SCALES.penta;
    const d = Math.floor(deg);
    const o = Math.floor(d / sc.length);
    const m = ((d % sc.length) + sc.length) % sc.length;
    return this.root + this.transpose + (th.octave + oct + o) * 12 + sc[m]!;
  }
  note(th: Thread, deg: number, o: NoteOpts = {}) {
    if (th.forceDeg != null && !o.free) deg = th.forceDeg;
    return this.emit({
      type: 'note', inst: o.inst || th.inst, midi: this.midi(th, deg, o.oct || 0),
      dur: o.dur ?? 1.5, vel: o.vel ?? 0.55, glide: o.glide || 0, vib: o.vib || 0, echo: o.echo || 0,
    }, th);
  }
  drum(th: Thread, kind: DrumKind, vel = 0.8) { return this.emit({ type: 'drum', kind, vel }, th); }
  sfx(th: Thread, kind: SfxKind, vel = 0.7, p = 1) { return this.emit({ type: 'sfx', kind, vel, p }, th); }
  say(th: Thread, raw: string): void {
    const text = String(raw).trim();
    if (!text) return;
    this.emit({ type: 'say', text: text.slice(0, 160), pitch: th.voicePitch, rate: th.voiceRate }, th);
    this.emit({ type: 'text', s: text.slice(0, 60), style: 'sub', size: 40, x: 0, y: this.hh * 0.72, color: this.col(th, 15) }, th);
  }

  // ---- turtle helpers ----
  wrapPos(th: Thread) {
    const W = this.hw * 1.05, H = this.hh * 1.05;
    if (th.x > W) th.x -= 2 * W; if (th.x < -W) th.x += 2 * W;
    if (th.y > H) th.y -= 2 * H; if (th.y < -H) th.y += 2 * H;
  }
  fwd(th: Thread, d: number, draw = true, w = 3, dur = 0.15, dl = 0): void {
    const a = th.ang * Math.PI / 180;
    const x0 = th.x, y0 = th.y;
    th.x += Math.cos(a) * d; th.y += Math.sin(a) * d;
    if (draw) this.stroke(th, [[x0, y0], [th.x, th.y]], w, dur, dl);
    this.wrapPos(th);
  }
  stroke(th: Thread, pts: Point[], w = 3, dur = 0.3, dl = 0, extra: { delay?: number; paw?: boolean } = {}): void {
    if (pts.length < 2) return;
    this.emit({ type: 'stroke', pts, w: w * th.size, dur, color: this.col(th, dl), ...extra }, th);
  }
  // points along a curve f(t) -> [along, across] relative to turtle heading, moves turtle to end
  curve(th: Thread, n: number, fn: (t: number) => Point, opts: CurveOpts = {}): Point[] {
    const a = th.ang * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const pts: Point[] = [];
    for (let i = 0; i <= n; i++) {
      const [u, v] = fn(i / n);
      pts.push([th.x + u * ca - v * sa, th.y + u * sa + v * ca]);
    }
    this.stroke(th, pts, opts.w ?? 3, opts.dur ?? 0.5, opts.dl ?? 0);
    if (opts.move !== false) { th.x = pts[n]![0]; th.y = pts[n]![1]; this.wrapPos(th); }
    return pts;
  }
  shape(th: Thread, kind: ShapeKind, r: number, o: ShapeOpts = {}) {
    return this.emit({
      type: 'shape', kind, x: o.x ?? th.x, y: o.y ?? th.y, r: r * th.size, rot: o.rot ?? th.ang,
      color: o.color || this.col(th, o.dl || 0), fill: !!o.fill, w: o.w ?? 3, life: o.life ?? 1.2, grow: o.grow || 0, n: o.n,
    }, th);
  }
  particles(th: Thread, kind: ParticleKind, n: number, o: ParticleOpts = {}) {
    return this.emit({ type: 'particles', kind, n: Math.min(400, Math.round(n)), x: o.x ?? th.x, y: o.y ?? th.y, color: o.color || this.col(th), ch: o.ch, spread: o.spread ?? 1 }, th);
  }
  text(th: Thread, s: string, o: TextOpts = {}) {
    return this.emit({ type: 'text', s: String(s), x: o.x ?? th.x, y: o.y ?? th.y, size: o.size ?? 40, style: o.style || 'float', color: o.color || this.col(th, 10) }, th);
  }

  // ---- execution ----
  doOp(th: Thread, fn: () => void): void { th.lastFn = fn; fn(); }

  exec(th: Thread, tok: Token): boolean {
    switch (tok.t) {
      case 'space':
        if (tok.n >= 3) { this.hl(th, tok.g0, tok.g1); th.pc++; return true; }
        th.pc++; return false;
      case 'word': return this.execWord(th, tok);
      case 'num': {
        this.hl(th, tok.g0, tok.g1);
        th.arg = tok.value;
        const v = tok.value;
        this.doOp(th, () => {
          this.text(th, fmtNum(v), { style: 'num', size: 34 });
          this.emit({ type: 'dtmf', digits: tok.text.replace(/\D/g, '').slice(0, 8) }, th);
        });
        th.arg = v; th.pc++; return true;
      }
      case 'math': {
        this.hl(th, tok.g0, tok.g1);
        const v = tok.value;
        const label = `${tok.text} = ${fmtNum(v)}`;
        this.doOp(th, () => {
          this.emit({ type: 'math', s: label, x: th.x, y: th.y, color: this.col(th, 15) }, th);
          this.emit({ type: 'dtmf', digits: fmtNum(v).replace(/\D/g, '').slice(0, 10) || '0' }, th);
          if (v === 42) { this.emit({ type: 'banner', text: 'THE ANSWER.' }, th); this.particles(th, 'stars', 60); }
          if (!Number.isFinite(v)) { this.emit({ type: 'glitch', amt: 1, dur: 0.8 }, th); this.emit({ type: 'banner', text: 'MATH.EXE HAS STOPPED' }, th); }
        });
        th.arg = Number.isFinite(v) ? v : null;
        th.pc++; return true;
      }
      case 'quote': {
        this.hl(th, tok.g0, tok.g1);
        const text = tok.text;
        this.doOp(th, () => { this.say(th, text || '...'); this.sfx(th, 'data', 0.25); });
        th.pc++; return true;
      }
      case 'emoji': {
        this.hl(th, tok.g0, tok.g1);
        this.doOp(th, () => this.emoji(th, tok.ch, tok.n));
        th.pc++; return true;
      }
      case 'sym': return this.execSym(th, tok);
      default:
        th.pc++; return false;
    }
  }

  // A chunk of letters is split into steps: a held key (jjjj) is one step with a
  // ratchet, and runs over neighbouring keys (asdf) are marked as rolls.
  plan(tok: WordTok): Step[] {
    const cached = this.plans.get(tok);
    if (cached) return cached;
    const Ls = tok.letters; const steps: Step[] = [];
    let i = 0;
    while (i < Ls.length) {
      const c = Ls[i].ch.toLowerCase(); let j = i + 1;
      while (j < Ls.length && Ls[j].ch.toLowerCase() === c) j++;
      const big = Ls.slice(i, j).some((l) => l.ch !== l.ch.toLowerCase());
      steps.push({ ch: Ls[i].ch, g0: Ls[i].g, g1: Ls[j - 1].g + 1, n: j - i, key: keyInfo(c), big });
      i = j;
    }
    // rolls: >= 3 consecutive steps on neighbouring keys, same direction
    let s = 0;
    while (s < steps.length) {
      let e = s + 1; let dir = 0;
      while (e < steps.length && adjacent(steps[e - 1].key, steps[e].key)) {
        const d = Math.sign(steps[e].key.col - steps[e - 1].key.col);
        if (dir && d !== dir) break;
        dir = d; e++;
      }
      if (e - s >= 3) { steps[s].roll = { len: e - s, dir, keys: steps.slice(s, e).map((x) => x.key) }; s = e; } else s++;
    }
    this.plans.set(tok, steps);
    return steps;
  }

  // keyboard -> screen. Each thread gets its own rotated keyboard, and it turns a bit each generation.
  keyPos(th: Thread, key: KeyInfo): Point {
    const u = (key.x - 0.5) * 1.75 * this.hw, v = (key.y - 0.5) * 1.35 * this.hh;
    const a = (th.id * 47 + th.gen * 9) * Math.PI / 180, sc = 1 - (th.id % 3) * 0.12;
    const ca = Math.cos(a), sa = Math.sin(a);
    return [(u * ca - v * sa) * sc, (u * sa + v * ca) * sc];
  }

  execWord(th: Thread, tok: WordTok): boolean {
    const steps = this.plan(tok);
    const st = steps[th.sub];
    if (!st) { th.pc++; th.sub = 0; return false; }
    if (th.sub === 0) {
      th.paw = null;
      if (tok.caps) this.say(th, tok.text.toLowerCase());
      const nx = th.toks[th.pc + 1];
      if (!tok.caps && nx && nx.t === 'sym' && (nx.ch === '?' || nx.ch === '!') && tok.letters.length >= 2) this.say(th, tok.text + nx.ch);
    }
    this.hl(th, st.g0, st.g1);
    this.doOp(th, () => this.keyStep(th, st));
    th.sub++;
    if (th.sub >= steps.length) {
      th.sub = 0; th.pc++;
      this.chunkEnd(th, tok);
    }
    return true;
  }

  keyStep(th: Thread, st: Step): void {
    const [px, py] = this.keyPos(th, st.key);
    // the paw path: glowing line from the previous key in this chunk
    if (th.paw) this.emit({ type: 'stroke', pts: [th.paw, [px, py]], w: 1.5, dur: 0.12, color: this.col(th, -10), paw: true }, th);
    th.paw = [px, py];
    th.x = px; th.y = py;
    // a key-cap lights up where the key sits
    this.shape(th, 'square', st.big ? 16 : 10, { rot: th.id * 47 + th.gen * 9, life: 0.45, w: 2, dl: 20 });
    if (st.roll) {
      // glissando sweep through the rolled keys
      const pts = st.roll.keys.map((k) => this.keyPos(th, k));
      const sm: Point[] = [];
      for (let i = 0; i < pts.length - 1; i++) for (let t = 0; t < 1; t += 0.1) {
        const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
        sm.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * 40]);
      }
      sm.push(pts[pts.length - 1]);
      this.stroke(th, sm, 4, 0.5, 15);
      this.sfx(th, 'gliss', 0.5, st.roll.dir * st.roll.len);
      this.particles(th, 'stars', 6 * st.roll.len);
    }
    th.forceDeg = st.key.deg;
    const before = this.ev.length;
    this.letter(th, st.ch, st.big);
    th.forceDeg = null;
    if (st.n > 1) {
      // held key: ratchet the sounds, spread over a few ticks
      const reps = Math.min(16, st.n);
      const span = 1 + Math.floor((Math.min(st.n, 24) - 1) / 4);
      th.wait = span - 1;
      const total = span * this.tickDur;
      const sounds = this.ev.slice(before).filter((e) => e.type === 'note' || e.type === 'drum' || e.type === 'sfx');
      for (let r = 1; r < reps; r++) for (const s of sounds) {
        this.ev.push({ ...s, at: (s.at || 0) + r * total / reps, vel: (s.vel || 0.5) * (0.6 + 0.4 * r / reps) });
      }
      this.particles(th, 'stream', 3 * reps, { spread: 0.6 });
      if (st.n >= 6) this.emit({ type: 'view', shake: Math.min(30, st.n * 1.5) }, th);
    }
  }

  // end of a chunk: longer mashes cast a spell from the effect library (deterministic per chunk)
  chunkEnd(th: Thread, tok: WordTok): void {
    const len = tok.letters.length;
    const h = hash(tok.lower);
    if (len >= 5 || (len >= 3 && h % 3 === 0)) {
      const op = SPELLS[h % SPELLS.length];
      this.keyword(th, op, Math.min(3, 1 + Math.floor(len / 8)));
      this.emit({ type: 'log', text: `SPELL ${tok.text.slice(0, 16)} -> ${op.toUpperCase()} :: t${th.id} :: 0x${(h & 0xffff).toString(16).toUpperCase().padStart(4, '0')}` }, th);
    } else if (len >= 3 && h % 5 === 1) {
      this.text(th, tok.text, { style: 'float', size: 30 + len * 3 });
    }
  }

  execSym(th: Thread, tok: SymTok): boolean {
    const ch = tok.ch;
    const n = tok.n;
    const lineOf = th.pairs;
    // structural symbols
    if (ch === '(') {
      this.hl(th, tok.g0, tok.g1);
      const close = lineOf.get(th.pc);
      const count = Math.round(this.takeArg(th, 2, 1, 64));
      th.loops.push({ start: th.pc + 1, left: count - 1, close });
      th.pc++; return false;
    }
    if (ch === ')') {
      this.hl(th, tok.g0, tok.g1);
      const top = th.loops[th.loops.length - 1];
      if (top && (top.close === undefined || top.close === th.pc)) {
        if (top.left > 0) { top.left--; th.pc = top.start; } else { th.loops.pop(); th.pc++; }
        return false;
      }
      // unmatched ')': jump to the start of the line, once per generation
      const v = th.visits.get(th.pc) || 0;
      if (v < 1) { th.visits.set(th.pc, v + 1); th.pc = th.start; this.drum(th, 'tom', 0.4); return true; }
      th.pc++; return false;
    }
    if (ch === '[') {
      this.hl(th, tok.g0, tok.g1);
      const close = lineOf.get(th.pc) ?? th.end;
      const runs = Math.round(this.takeArg(th, 1, 1, 16));
      if (this.threads.length < MAX_THREADS && close > th.pc + 1) {
        const c = new Thread(this, th.toks, th.pc + 1, close, {
          pairs: th.pairs, child: true, runs, x: th.x, y: th.y, ang: th.ang + 90,
          hue: (th.hue + 60) % 360, octave: th.octave + 1, inst: this.pick(INSTRUMENTS), speed: th.speed,
        });
        this.threads.push(c);
        this.sfx(th, 'spawn', 0.4);
        this.emit({ type: 'log', text: `SPAWN thread ${c.id} ×${runs}` }, th);
        th.pc = Math.min(close + 1, th.end);
        return true;
      }
      th.pc++; return false;
    }
    if (ch === ']') { this.hl(th, tok.g0, tok.g1); this.drum(th, 'hat', 0.3); th.pc++; return true; }

    this.hl(th, tok.g0, tok.g1);
    if (ch === ':') this.symbol(th, ch, n); // repeat: must not become its own "last op"
    else this.doOp(th, () => this.symbol(th, ch, n));
    th.pc++;
    return !(ch === ',' && n === 1 && false);
  }

  fork(th: Thread) {
    if (this.threads.length >= MAX_THREADS) { this.note(th, 0); this.note(th, 2); this.note(th, 4); return; }
    const c = new Thread(this, th.toks, th.start, th.end, {
      pairs: th.pairs, child: true, runs: 2, pc: Math.min(th.pc + 1, th.end), x: -th.x, y: -th.y, ang: th.ang + 180,
      hue: (th.hue + 180) % 360, octave: th.octave - 1, inst: this.pick(INSTRUMENTS), speed: th.speed,
    });
    this.threads.push(c);
    this.sfx(th, 'spawn', 0.5);
    this.emit({ type: 'log', text: `FORK t${th.id} -> t${c.id}` }, th);
  }

  // =================== LETTERS ===================
  letter(th: Thread, ch: string, big: boolean): void {
    let base = stripAccents(ch.toLowerCase())[0] || 'a';
    if (!LETTERS.includes(base)) base = LETTERS[(ch.codePointAt(0) || 0) % 26];
    const k = big ? 2 : 1;
    const vel = big ? 0.85 : 0.55;
    const li = LETTERS.indexOf(base);
    const deg = li % 8;
    switch (base) {
      case 'a': {
        const r = 60 * k, sw = 110 * Math.PI / 180;
        this.curve(th, 16, (t) => [Math.sin(t * sw) * r, (1 - Math.cos(t * sw)) * r], { dur: 0.25 });
        th.ang += 110; this.note(th, 0, { vel }); break;
      }
      case 'b':
        this.note(th, 0, { inst: 'bass', oct: -1, vel: vel + 0.15, dur: 2 });
        this.shape(th, 'circle', 32 * k, { fill: true, dl: -15, life: 0.5, grow: 0.6 }); break;
      case 'c':
        this.shape(th, 'circle', this.takeArg(th, 28, 4, 400) * k, { life: 1.6 });
        this.note(th, 2, { vel }); break;
      case 'd':
        this.drum(th, 'kick', vel + 0.2);
        this.emit({ type: 'view', zoom: 0.06 * k }, th); break;
      case 'e':
        this.emit({ type: 'feedback', amt: 0.55, zoom: 1.015, rot: 0.6, dur: 1.5 }, th);
        this.note(th, 4, { vel: vel * 0.8, echo: 1 }); break;
      case 'f':
        this.fwd(th, this.takeArg(th, 70, -800, 800) * k, true, 3 * k);
        this.note(th, 1, { vel }); return;
      case 'g':
        this.emit({ type: 'glitch', amt: 0.35 * k, dur: 0.25 }, th);
        this.sfx(th, 'data', vel * 0.6); break;
      case 'h':
        this.drum(th, 'hat', vel * 0.8);
        this.particles(th, 'dots', 6 * k, { spread: 0.4 }); break;
      case 'i':
        this.stroke(th, [[th.x, th.y], [th.x, th.y - 90 * k]], 2, 0.12, 20);
        this.note(th, 7, { vel: vel * 0.7, dur: 0.6 }); break;
      case 'j': {
        this.shape(th, 'star', 10, { life: 0.8, fill: true });
        th.x = (this.r() - 0.5) * 1.8 * this.hw; th.y = (this.r() - 0.5) * 1.8 * this.hh;
        this.sfx(th, 'boing', vel); return;
      }
      case 'k':
        this.drum(th, 'snare', vel + 0.1);
        this.emit({ type: 'flash', color: { h: th.hue, s: 30, l: 90 }, a: 0.12 * k }, th); break;
      case 'l':
        this.fwd(th, 200 * k, true, 2, 0.35);
        this.note(th, 3, { vel, dur: 4 }); return;
      case 'm':
        this.emit({ type: 'mode', mirror: 'toggle' }, th);
        this.note(th, 5, { vel }); break;
      case 'n':
        this.note(th, (ch.codePointAt(0) || 0) % 10, { vel });
        this.shape(th, 'circle', 7 * k, { fill: true, life: 2 }); break;
      case 'o':
        this.shape(th, 'ring', 20 * k, { grow: 3, life: 1.2, w: 2 });
        this.sfx(th, 'ooh', vel, 1 + deg * 0.1); break;
      case 'p':
        this.particles(th, 'burst', 26 * k);
        this.note(th, 6, { vel, inst: 'pluck' }); break;
      case 'q':
        this.emit({ type: 'view', shake: 14 * k }, th);
        this.sfx(th, 'rumble', vel); break;
      case 'r':
        this.emit({ type: 'view', rot: 12 * k }, th);
        th.ang += 45; this.sfx(th, 'sweep', vel * 0.6); break;
      case 's': {
        const L = 220 * k, A = 30 * k, f = 2 + (li % 3);
        this.curve(th, 40, (t) => [t * L, Math.sin(t * Math.PI * 2 * f) * A], { dur: 0.4 });
        this.note(th, 3, { vel, glide: 2 }); return;
      }
      case 't':
        this.shape(th, 'tri', 30 * k, { life: 1.4 });
        this.drum(th, 'tom', vel); break;
      case 'u':
        th.octave = th.octave >= 2 ? -1 : th.octave + 1;
        this.particles(th, 'chars', 6, { ch: '↑' });
        this.note(th, 0, { vel, glide: 12 }); break;
      case 'v': {
        const L = 120 * k;
        this.curve(th, 8, (t) => [t * L, (Math.floor(t * 8) % 2 ? 1 : -1) * 18 * k], { dur: 0.2 });
        this.note(th, 2, { vel, vib: 1 }); return;
      }
      case 'w': {
        const y0 = th.y, A = 40 * k, f = 1 + (this.r() * 3 | 0);
        const pts: Point[] = [];
        for (let i = 0; i <= 80; i++) { const x = -this.hw + i / 80 * 2 * this.hw; pts.push([x, y0 + Math.sin(i / 80 * Math.PI * 2 * f) * A]); }
        this.stroke(th, pts, 2 * k, 0.6, 10);
        this.sfx(th, 'whoosh', vel); break;
      }
      case 'x':
        this.shape(th, 'cross', 26 * k, { life: 0.9, w: 4 });
        this.particles(th, 'burst', 40 * k);
        this.drum(th, 'crash', vel * 0.7); break;
      case 'y':
        this.particles(th, 'confetti', 20 * k);
        this.sfx(th, 'chirp', vel); break;
      case 'z': {
        const L = 160 * k; const jit: number[] = [];
        for (let i = 0; i <= 8; i++) jit.push((this.r() - 0.5) * 50);
        this.curve(th, 8, (t) => [t * L, jit[Math.round(t * 8)] * (t > 0 && t < 1 ? 1 : 0)], { dur: 0.08, w: 3, dl: 30 });
        this.sfx(th, 'zap', vel); return;
      }
    }
    // drift: a small step so letters paint a path
    th.ang += ((li % 5) - 2) * 9;
    this.fwd(th, 16 * k, true, 1, 0.1, -25);
  }

  // =================== SYMBOLS ===================
  symbol(th: Thread, ch: string, n: number): void {
    const k = Math.min(4, n);
    switch (ch) {
      case '!':
        this.drum(th, 'kick', 1); this.sfx(th, 'explode', 0.4 + 0.2 * k);
        this.emit({ type: 'flash', color: { h: th.hue, s: 80, l: 70 }, a: 0.25 + 0.15 * k }, th);
        this.emit({ type: 'view', shake: 10 * k, zoom: 0.08 * k }, th);
        this.shape(th, 'ring', 30, { grow: 6 * k, life: 0.8, w: 6 });
        this.particles(th, 'burst', 40 * k);
        if (n >= 3) this.emit({ type: 'glitch', amt: 0.5, dur: 0.4 }, th);
        break;
      case '?': for (let i = 0; i < k; i++) this.letter(th, LETTERS[Math.floor(this.r() * 26)], this.r() < 0.2); this.sfx(th, 'question', 0.4); break;
      case '.': th.wait = n - 1; this.shape(th, 'circle', 3, { fill: true, life: 3 }); break;
      case ',': break;
      case '…': th.wait = 2; break;
      case '~': {
        const L = 260 * k, A = 35;
        this.curve(th, 60, (t) => [t * L, Math.sin(t * Math.PI * 2 * k) * A], { dur: 0.6, w: 3 });
        this.note(th, 4, { glide: 5, dur: 3, inst: 'pad', vel: 0.4 });
        this.emit({ type: 'view', wobble: 0.5 * k }, th);
        break;
      }
      case '-': case '—': case '–': this.fwd(th, 60 * n, true, 2); this.note(th, 1, { dur: n }); break;
      case '_': this.stroke(th, [[-this.hw, this.hh * 0.9], [this.hw, this.hh * 0.9]], 2 * k, 0.4); this.note(th, 0, { oct: -1, dur: 2 }); break;
      case '|': this.stroke(th, [[th.x, -this.hh], [th.x, this.hh]], 1.5 * k, 0.2); this.drum(th, 'clap', 0.6); th.x += 30; break;
      case '/': this.stroke(th, [[th.x - 60 * k, th.y + 60 * k], [th.x + 60 * k, th.y - 60 * k]], 2, 0.15); this.note(th, 3, { glide: 3, dur: 0.5 }); th.x += 40; break;
      case '\\': this.stroke(th, [[th.x - 60 * k, th.y - 60 * k], [th.x + 60 * k, th.y + 60 * k]], 2, 0.15); this.note(th, 3, { glide: -3, dur: 0.5 }); th.x += 40; break;
      case '*': this.particles(th, 'stars', 20 * k); this.shape(th, 'star', 22 * k, { fill: true, life: 1 }); this.sfx(th, 'chime', 0.5); break;
      case '#': this.emit({ type: 'glitch', amt: 0.6 * k, dur: 0.3 * k }, th); this.sfx(th, 'crunch', 0.6); this.particles(th, 'chars', 10 * k, { ch: '01#$%&@' }); break;
      case '@': this.keyword(th, 'spiral', k); break;
      case '$': case '€': case '£': case '¥': this.keyword(th, 'money', k); break;
      case '%': this.emit({ type: 'mode', kaleido: 'toggle' }, th); this.note(th, 0); this.note(th, 2); this.note(th, 4); break;
      case '^': th.y -= 80 * k; this.particles(th, 'chars', 5, { ch: '^' }); this.note(th, 7, { glide: 12, dur: 1 }); break;
      case '+': th.size = Math.min(4, th.size * 1.25); this.shape(th, 'cross', 14 * k, { rot: 45, life: 0.8 }); this.note(th, 5, { dur: 0.5 }); break;
      case '=': this.stroke(th, [[th.x - 50, th.y - 6], [th.x + 50, th.y - 6]], 2, 0.1); this.stroke(th, [[th.x - 50, th.y + 6], [th.x + 50, th.y + 6]], 2, 0.1);
        this.note(th, 0, { dur: 3, vel: 0.35 }); this.note(th, 2, { dur: 3, vel: 0.35 }); this.note(th, 4, { dur: 3, vel: 0.35 }); break;
      case '<': th.ang -= 30 * n; this.note(th, -1, { dur: 0.4 }); break;
      case '>': th.ang += 30 * n; this.note(th, 1, { dur: 0.4 }); break;
      case ':': if (th.lastFn) { const f = th.lastFn; for (let i = 0; i < k; i++) f(); } break;
      case ';': this.drum(th, 'snare', 0.6); this.shape(th, 'dot', 4, { fill: true }); break;
      case '&': for (let i = 0; i < k; i++) this.fork(th); break;
      case '{': this.emit({ type: 'view', spin: 12 * k }, th); this.sfx(th, 'sweep', 0.4); break;
      case '}': this.emit({ type: 'view', spin: -12 * k }, th); this.sfx(th, 'sweep', 0.4, 0.5); break;
      case '`': case '´': this.emit({ type: 'glitch', amt: 0.2, dur: 0.15 }, th); this.sfx(th, 'data', 0.3); break;
      case "'": case '’': this.drum(th, 'hat', 0.4); break;
      default: {
        // unknown symbol: it becomes a letter, chosen by its code point
        const cp = ch.codePointAt(0) || 0;
        this.letter(th, LETTERS[cp % 26], false);
        if (cp > 127) this.text(th, ch, { size: 46, style: 'float' });
      }
    }
  }

  // =================== EMOJI ===================
  emoji(th: Thread, ch: string, n: number): void {
    const power = EMOJI_POWERS[ch] || EMOJI_POWERS[ch.replace(/️/g, '')];
    this.emit({ type: 'emoji', ch, x: th.x, y: th.y, size: 60 + 18 * Math.min(n, 5), life: 2.5 }, th);
    if (power) { this.keyword(th, power, Math.min(3, n)); }
    else {
      this.particles(th, 'emoji', 6 + 6 * Math.min(n, 6), { ch });
      this.note(th, hash(ch) % 10, { inst: 'bell', vel: 0.5 });
    }
    this.fwd(th, 50, false);
  }

  // =================== KEYWORDS ===================
  nextTok(th: Thread, from = th.pc + 1): number {
    let i = from;
    while (i < th.end && th.toks[i].t === 'space') i++;
    return i < th.end ? i : -1;
  }

  creature(th: Thread, ch: string, sound: SfxKind | null, word: string | null, o: { kind?: 'run' | 'pop' | 'fly' | 'swim' | 'stomp' | 'float' | 'ufo' | 'drive'; size?: number; p?: number } = {}): void {
    this.emit({ type: 'actor', kind: o.kind || 'run', ch, x: th.x, y: th.y, ang: th.ang, size: o.size || 70 }, th);
    if (sound) this.sfx(th, sound, 0.8, o.p ?? (0.8 + this.r() * 0.4));
    if (word) this.text(th, word, { style: 'big', size: 56 });
  }

  keyword(th: Thread, op: Op, boost = 1, tok: WordTok | null = null): void {
    const b = Math.max(1, Math.min(3, boost));
    const R = () => this.r();
    switch (op) {
      // ---------- shapes ----------
      case 'circle': this.shape(th, 'circle', this.takeArg(th, 50, 2, 600) * b, { life: 2.5, w: 4 }); this.note(th, 2, { inst: 'bell' }); break;
      case 'square': this.shape(th, 'square', this.takeArg(th, 50, 2, 600) * b, { life: 2.5, w: 4 }); this.drum(th, 'tom', 0.6); break;
      case 'tri': this.shape(th, 'tri', this.takeArg(th, 55, 2, 600) * b, { life: 2.5, w: 4 }); this.note(th, 4); break;
      case 'star': this.shape(th, 'star', this.takeArg(th, 50, 2, 600) * b, { life: 2.5, fill: true }); this.particles(th, 'stars', 12); this.sfx(th, 'chime', 0.6); break;
      case 'heart': this.shape(th, 'heart', this.takeArg(th, 45, 2, 600) * b, { life: 3, fill: true, color: { h: 345, s: 90, l: 62 } }); this.particles(th, 'emoji', 14 * b, { ch: '❤️' }); this.note(th, 4, { inst: 'pad', dur: 4 }); this.note(th, 6, { inst: 'pad', dur: 4 }); break;
      case 'flower': {
        const n = Math.round(this.takeArg(th, 6, 3, 24));
        this.shape(th, 'flower', 55 * b, { n, life: 3, fill: true });
        this.note(th, 0, { inst: 'bell' }); this.note(th, 4, { inst: 'bell' }); break;
      }
      case 'ring': this.shape(th, 'ring', 30 * b, { grow: 5, life: 1.6, w: 5 }); this.sfx(th, 'ooh', 0.6); break;
      case 'spiral': {
        const turns = this.takeArg(th, 4, 1, 30); const R0 = 140 * b;
        const cx = th.x, cy = th.y; const pts: Point[] = [];
        for (let i = 0; i <= 200; i++) { const t = i / 200; const a = t * turns * Math.PI * 2; pts.push([cx + Math.cos(a) * t * R0, cy + Math.sin(a) * t * R0]); }
        this.stroke(th, pts, 3, 1.2); this.sfx(th, 'sweep', 0.6, 2); this.emit({ type: 'view', spin: 6 }, th); break;
      }
      case 'tree': {
        const depth = Math.round(this.takeArg(th, 7, 2, 9));
        const segs: [Point, Point, number][] = [];
        const grow = (x: number, y: number, a: number, len: number, d: number): void => {
          if (d === 0 || segs.length > 600) return;
          const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
          segs.push([[x, y], [x2, y2], d]);
          const sp = 0.35 + R() * 0.3;
          grow(x2, y2, a - sp, len * 0.72, d - 1); grow(x2, y2, a + sp, len * 0.72, d - 1);
        };
        grow(th.x, th.y + 120, -Math.PI / 2, 90 * b, depth);
        for (const [p0, p1, d] of segs) this.emit({ type: 'stroke', pts: [p0, p1], w: d * 0.8, dur: 0.15, delay: (depth - d) * 0.18, color: { h: d <= 2 ? (th.hue + 90) % 360 : 30, s: d <= 2 ? 80 : 45, l: d <= 2 ? 60 : 40 } }, th);
        this.note(th, 0, { inst: 'pad', dur: 6 }); this.note(th, 4, { inst: 'pad', dur: 6 }); break;
      }
      case 'sun':
        this.shape(th, 'sun', 50 * b, { life: 3, fill: true, color: { h: 45, s: 100, l: 60 } }); this.note(th, 7, { inst: 'bell' }); break;
      case 'moon':
        this.shape(th, 'moon', 45 * b, { life: 3, fill: true, color: { h: 55, s: 60, l: 85 } }); this.emit({ type: 'bg', l: 2 }, th); this.note(th, 2, { inst: 'pad', dur: 6 }); break;
      case 'grid': {
        const s = this.takeArg(th, 80, 10, 400);
        for (let x = -this.hw; x <= this.hw; x += s) this.stroke(th, [[x, -this.hh], [x, this.hh]], 1, 0.4, -20);
        for (let y = -this.hh; y <= this.hh; y += s) this.stroke(th, [[-this.hw, y], [this.hw, y]], 1, 0.4, -20);
        this.sfx(th, 'data', 0.4); break;
      }
      case 'poly': this.shape(th, 'poly', 55 * b, { n: Math.round(this.takeArg(th, 6, 3, 40)), life: 2.5, w: 4 }); this.note(th, 3); break;
      case 'dot': this.shape(th, 'circle', 10 * b, { fill: true, life: 4 }); this.note(th, 5, { dur: 0.3 }); break;
      case 'snowflake': {
        const L = 90 * b;
        for (let i = 0; i < 6; i++) {
          const a = i * Math.PI / 3; const c = Math.cos(a), s = Math.sin(a);
          this.stroke(th, [[th.x, th.y], [th.x + c * L, th.y + s * L]], 2, 0.3, 30);
          for (const f of [0.4, 0.7]) {
            const px = th.x + c * L * f, py = th.y + s * L * f;
            for (const sg of [-1, 1]) { const a2 = a + sg * 0.7; this.stroke(th, [[px, py], [px + Math.cos(a2) * L * 0.25, py + Math.sin(a2) * L * 0.25]], 2, 0.3, 30); }
          }
        }
        this.sfx(th, 'chime', 0.6); break;
      }
      // ---------- curves ----------
      case 'sin': case 'cos': case 'tan': {
        const A = Math.round(this.takeArg(th, 60, 5, 400) * b); const kf = 0.02;
        const f = op === 'sin' ? Math.sin : op === 'cos' ? Math.cos : (x: number) => Math.max(-4, Math.min(4, Math.tan(x)));
        const pts: Point[] = []; const y0 = th.y;
        for (let i = 0; i <= 160; i++) { const x = -this.hw + i / 160 * 2 * this.hw; pts.push([x, y0 - A * f(x * kf)]); }
        this.stroke(th, [[-this.hw, y0], [this.hw, y0]], 1, 0.3, -30);
        this.stroke(th, pts, 3, 1.0);
        this.emit({ type: 'math', s: `y = ${A}·${op}(${kf}x)`, x: -this.hw * 0.55, y: y0 - A - 30, color: this.col(th, 20) }, th);
        this.note(th, 0, { glide: 7, dur: 4, inst: 'pad' }); break;
      }
      case 'wave': {
        const A = 50 * b;
        for (let j = 0; j < 3; j++) {
          const pts: Point[] = []; const y0 = th.y + (j - 1) * 40; const ph = R() * 6;
          for (let i = 0; i <= 100; i++) { const x = -this.hw + i / 100 * 2 * this.hw; pts.push([x, y0 + Math.sin(i / 100 * Math.PI * 4 + ph) * A]); }
          this.emit({ type: 'stroke', pts, w: 3, dur: 0.8, delay: j * 0.12, color: { h: (190 + j * 20) % 360, s: 90, l: 60 } }, th);
        }
        this.sfx(th, 'whoosh', 0.8); this.emit({ type: 'view', wobble: 1.5 }, th); break;
      }
      case 'rose': {
        const kk = Math.round(this.takeArg(th, 2 + (R() * 6 | 0), 1, 13)); const Rr = 120 * b;
        const pts: Point[] = [];
        for (let i = 0; i <= 300; i++) { const a = i / 300 * Math.PI * 2; const r = Rr * Math.cos(kk * a); pts.push([th.x + r * Math.cos(a), th.y + r * Math.sin(a)]); }
        this.stroke(th, pts, 2.5, 1.4);
        this.emit({ type: 'math', s: `r = cos(${kk}θ)`, x: th.x, y: th.y - Rr - 20, color: this.col(th, 20) }, th);
        this.note(th, 0, { inst: 'bell' }); this.note(th, kk, { inst: 'bell' }); break;
      }
      case 'zigzag': {
        const L = 300 * b; const jit: number[] = []; for (let i = 0; i <= 12; i++) jit.push((R() - 0.5) * 90);
        this.curve(th, 12, (t) => [t * L, jit[Math.round(t * 12)]], { w: 4, dur: 0.1, dl: 30 });
        this.emit({ type: 'flash', color: { h: 200, s: 60, l: 90 }, a: 0.35 }, th);
        this.sfx(th, 'zap', 0.9); this.drum(th, 'crash', 0.5); break;
      }
      case 'bounce': {
        const L = 300 * b;
        this.curve(th, 60, (t) => [t * L, -Math.abs(Math.sin(t * Math.PI * 4)) * 80 * (1 - t * 0.6)], { dur: 0.8 });
        this.sfx(th, 'boing', 0.7); break;
      }
      case 'dna': {
        const L = 400 * b; const A = 40;
        const p1: Point[] = [], p2: Point[] = [];
        const a = th.ang * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
        for (let i = 0; i <= 80; i++) {
          const t = i / 80; const u = t * L; const v1 = Math.sin(t * 12) * A, v2 = -v1;
          p1.push([th.x + u * ca - v1 * sa, th.y + u * sa + v1 * ca]);
          p2.push([th.x + u * ca - v2 * sa, th.y + u * sa + v2 * ca]);
          if (i % 5 === 0) this.emit({ type: 'stroke', pts: [p1[i], p2[i]], w: 1, dur: 0.1, delay: t * 0.8, color: this.col(th, -20) }, th);
        }
        this.stroke(th, p1, 3, 0.8); this.emit({ type: 'stroke', pts: p2, w: 3, dur: 0.8, color: { h: (th.hue + 180) % 360, s: 90, l: 60 } }, th);
        this.note(th, 0); this.note(th, 3, { dur: 2 }); break;
      }
      case 'knot': {
        const a = 1 + (R() * 4 | 0), bb = a + 1 + (R() * 3 | 0); const S = 150 * b; const pts: Point[] = [];
        for (let i = 0; i <= 300; i++) { const t = i / 300 * Math.PI * 2; pts.push([th.x + Math.sin(a * t + Math.PI / 2) * S, th.y + Math.sin(bb * t) * S * 0.8]); }
        this.stroke(th, pts, 2.5, 1.5);
        this.emit({ type: 'math', s: `x=sin(${a}t+π/2)  y=sin(${bb}t)`, x: th.x, y: th.y - S, color: this.col(th, 20) }, th);
        this.note(th, a); this.note(th, bb); break;
      }
      case 'scribble': {
        const pts: Point[] = [[th.x, th.y]]; let x = th.x, y = th.y, a = R() * 6;
        for (let i = 0; i < 60; i++) { a += (R() - 0.5) * 1.8; x += Math.cos(a) * 14 * b; y += Math.sin(a) * 14 * b; pts.push([x, y]); }
        this.stroke(th, pts, 2, 0.7); th.x = x; th.y = y; this.wrapPos(th);
        this.sfx(th, 'data', 0.5); break;
      }
      case 'math': {
        const F = this.pick(FORMULAS); const A = 40 + (R() * 80 | 0); const kk = Number((0.005 + R() * 0.03).toFixed(3));
        const pts: Point[] = [];
        for (let i = 0; i <= 200; i++) { const x = -this.hw + i / 200 * 2 * this.hw; const yv = F.f(x, A, kk); pts.push([x, -(Number.isFinite(yv) ? yv : 0)]); }
        this.stroke(th, [[-this.hw, 0], [this.hw, 0]], 1, 0.3, -30); this.stroke(th, [[0, -this.hh], [0, this.hh]], 1, 0.3, -30);
        this.stroke(th, pts, 3, 1.2);
        this.emit({ type: 'math', s: F.s(A, kk), x: 0, y: -this.hh * 0.6, color: this.col(th, 20), big: true }, th);
        this.sfx(th, 'data', 0.5); this.note(th, 0, { glide: 5, dur: 4, inst: 'lead' }); break;
      }
      // ---------- turtle ----------
      case 'go': this.fwd(th, this.takeArg(th, 120, -1000, 1000) * b, true, 3); this.note(th, 1); break;
      case 'back': this.fwd(th, -this.takeArg(th, 120, -1000, 1000) * b, true, 3); this.note(th, -1); break;
      case 'left': th.ang -= this.takeArg(th, 90); this.note(th, -2, { dur: 0.5 }); break;
      case 'right': th.ang += this.takeArg(th, 90); this.note(th, 2, { dur: 0.5 }); break;
      case 'turn': th.ang += 180; this.sfx(th, 'sweep', 0.5); break;
      case 'home': th.x = 0; th.y = 0; th.ang = -90; this.shape(th, 'ring', 10, { grow: 4, life: 0.8 }); this.note(th, 0, { oct: 1 }); break;
      case 'jump': th.x = (R() - 0.5) * 1.8 * this.hw; th.y = (R() - 0.5) * 1.8 * this.hh; this.sfx(th, 'boing', 0.7); break;
      case 'up': th.ang = -90; this.fwd(th, this.takeArg(th, 100) * b); this.note(th, 4, { glide: 5 }); break;
      case 'down': th.ang = 90; this.fwd(th, this.takeArg(th, 100) * b); this.note(th, 0, { glide: -5 }); break;
      // ---------- colors ----------
      case 'red': case 'green': case 'blue': case 'yellow': case 'orange': case 'pink': case 'purple': case 'cyan': case 'white': case 'gold': {
        const C = { red: [0, 95, 58], green: [125, 95, 55], blue: [215, 95, 60], yellow: [55, 100, 60], orange: [28, 100, 58], pink: [325, 95, 70], purple: [275, 85, 65], cyan: [185, 100, 55], white: [0, 0, 95], gold: [45, 90, 55] }[op];
        th.hue = C[0]; th.sat = C[1]; th.lit = C[2]; th.rainbow = false;
        this.shape(th, 'ring', 12, { grow: 6, life: 1, fill: false, w: 8 });
        this.particles(th, 'burst', 16);
        this.note(th, hash(op) % 7, { dur: 0.6 }); break;
      }
      case 'rainbow':
        th.rainbow = !th.rainbow || b > 1; th.sat = 95; th.lit = 60;
        this.emit({ type: 'rainbow' }, th); this.emit({ type: 'emoji', ch: '🌈', x: th.x, y: th.y, size: 110, life: 2.5 }, th);
        this.note(th, 0, { inst: 'bell' }); this.note(th, 2, { inst: 'bell' }); this.note(th, 4, { inst: 'bell' }); this.note(th, 7, { inst: 'bell' }); break;
      case 'dark': this.emit({ type: 'bg', l: 0 }, th); th.lit = Math.max(30, th.lit - 15); this.note(th, 0, { oct: -1, inst: 'pad', dur: 4 }); break;
      case 'light': this.emit({ type: 'bg', l: 8 }, th); th.lit = Math.min(85, th.lit + 15); this.note(th, 7, { inst: 'bell' }); break;
      case 'invert': this.emit({ type: 'invert', dur: 1.2 * b }, th); this.sfx(th, 'crunch', 0.5); break;
      // ---------- particles ----------
      case 'fire': this.particles(th, 'fire', 70 * b); this.sfx(th, 'fire', 0.7); this.emit({ type: 'bg', h: 15 }, th); break;
      case 'rain': this.particles(th, 'rain', 80 * b, { color: { h: 205, s: 80, l: 70 } }); this.sfx(th, 'rain', 0.6); break;
      case 'snow': this.particles(th, 'snow', 60 * b, { ch: '❄' }); this.sfx(th, 'chime', 0.4); this.emit({ type: 'bg', h: 210 }, th); break;
      case 'confetti': this.particles(th, 'confetti', 90 * b); this.sfx(th, 'party', 0.8); break;
      case 'boom':
        this.particles(th, 'burst', 120 * b); this.particles(th, 'smoke', 20);
        this.shape(th, 'ring', 40, { grow: 10, life: 1, w: 10 });
        this.emit({ type: 'flash', color: { h: 40, s: 100, l: 80 }, a: 0.7 }, th);
        this.emit({ type: 'view', shake: 30 * b, zoom: 0.2 }, th);
        this.emit({ type: 'glitch', amt: 0.6, dur: 0.4 }, th);
        this.sfx(th, 'explode', 1); this.drum(th, 'kick', 1);
        this.text(th, 'BOOM', { style: 'big', size: 90 }); break;
      case 'fireworks':
        for (let i = 0; i < 2 + b; i++) this.emit({ type: 'actor', kind: 'firework', x: (R() - 0.5) * this.hw * 1.6, y: this.hh, color: { h: R() * 360, s: 100, l: 65 }, delay: i * 0.3 }, th);
        this.sfx(th, 'whistle', 0.6); break;
      case 'bubbles': this.particles(th, 'bubbles', 30 * b); this.sfx(th, 'bubbles', 0.7); break;
      case 'smoke': this.particles(th, 'smoke', 40 * b); this.sfx(th, 'whoosh', 0.4, 0.5); break;
      case 'sparkle': this.particles(th, 'sparkle', 40 * b); this.sfx(th, 'chime', 0.6); break;
      case 'stars': this.particles(th, 'stars', 80 * b, { spread: 3 }); this.sfx(th, 'chime', 0.5, 1.5); break;
      case 'money': this.particles(th, 'money', 40 * b, { ch: '💸💰🪙💵' }); this.sfx(th, 'kaching', 0.8); this.text(th, '$$$', { style: 'big', size: 60, color: { h: 120, s: 90, l: 60 } }); break;
      // ---------- screen ----------
      case 'glitch': this.emit({ type: 'glitch', amt: 0.8 * b, dur: 0.6 * b }, th); this.sfx(th, 'crunch', 0.7); this.sfx(th, 'data', 0.6); break;
      case 'spin': this.emit({ type: 'view', spin: 25 * b }, th); this.sfx(th, 'sweep', 0.6, 1.5); break;
      case 'zoom': this.emit({ type: 'view', zoomTo: 1.4 * b }, th); this.sfx(th, 'sweep', 0.5, 2); break;
      case 'shrink': this.emit({ type: 'view', zoomTo: 0.6 / b }, th); this.sfx(th, 'sweep', 0.5, 0.5); break;
      case 'shake': this.emit({ type: 'view', shake: 25 * b }, th); this.sfx(th, 'rumble', 0.8); break;
      case 'flip': this.emit({ type: 'view', flip: true }, th); this.sfx(th, 'boing', 0.6, 0.5); break;
      case 'mirror': this.emit({ type: 'mode', mirror: 'toggle' }, th); this.sfx(th, 'chime', 0.4); break;
      case 'kaleido': this.emit({ type: 'mode', kaleido: 'toggle' }, th); this.note(th, 0, { inst: 'pad', dur: 4 }); this.note(th, 4, { inst: 'pad', dur: 4 }); break;
      case 'tunnel': this.emit({ type: 'feedback', amt: 0.85, zoom: 1.035, rot: 1.2, dur: 4 * b }, th); this.sfx(th, 'whoosh', 0.7, 0.6); break;
      case 'warp': this.emit({ type: 'feedback', amt: 0.8, zoom: 1.06, rot: 0, dur: 3 * b }, th); this.particles(th, 'warp', 80, { x: 0, y: 0 }); this.sfx(th, 'warp', 0.8); break;
      case 'tilt': this.emit({ type: 'view', rot: 25 * b }, th); this.sfx(th, 'sweep', 0.4); break;
      case 'calm': this.emit({ type: 'calm' }, th); this.note(th, 0, { inst: 'pad', dur: 6, vel: 0.4 }); break;
      case 'trails': this.emit({ type: 'trails', v: 0.02 }, th); this.note(th, 4, { echo: 1 }); break;
      // ---------- sound ----------
      case 'beep': this.note(th, 7, { inst: 'chip', oct: 1, dur: 0.5 }); this.shape(th, 'square', 8, { fill: true, life: 0.5 }); break;
      case 'boop': this.sfx(th, 'bloop', 0.8); this.shape(th, 'circle', 14, { fill: true, life: 0.6 }); break;
      case 'bassdrop': this.sfx(th, 'drop', 1); this.emit({ type: 'view', shake: 30, zoom: 0.3 }, th); this.emit({ type: 'glitch', amt: 0.4, dur: 0.6 }, th); break;
      case 'drum': case 'kick': this.drum(th, 'kick', 1); this.emit({ type: 'view', zoom: 0.08 }, th); this.shape(th, 'ring', 20, { grow: 4, life: 0.4 }); break;
      case 'snare': this.drum(th, 'snare', 0.9); this.emit({ type: 'flash', color: { h: 0, s: 0, l: 100 }, a: 0.15 }, th); break;
      case 'clap': this.drum(th, 'clap', 0.9); this.particles(th, 'dots', 12); break;
      case 'hat': this.drum(th, 'hat', 0.7); break;
      case 'laser': {
        this.sfx(th, 'laser', 0.8);
        const a = th.ang * Math.PI / 180;
        this.stroke(th, [[th.x, th.y], [th.x + Math.cos(a) * 2000, th.y + Math.sin(a) * 2000]], 5, 0.06, 25);
        break;
      }
      case 'siren': this.sfx(th, 'siren', 0.6); this.emit({ type: 'siren', dur: 1.6 }, th); break;
      case 'chord': for (const d of [0, 2, 4, 7]) this.note(th, d, { dur: 4, vel: 0.35, inst: th.inst }); this.shape(th, 'poly', 40, { n: 4, life: 1.5 }); break;
      case 'arp': {
        const base = (R() * 5) | 0; const tick = 60 / this.bpm / 4;
        for (let i = 0; i < 8; i++) { const e = this.note(th, base + [0, 2, 4, 7, 9, 7, 4, 2][i], { dur: 0.8, vel: 0.45 }); e.at = i * tick * 0.5; }
        this.particles(th, 'chars', 8, { ch: '♪♫♬' }); break;
      }
      // ---------- instruments ----------
      case 'i_piano': case 'i_organ': case 'i_bell': case 'i_bass': case 'i_chip': case 'i_pad': case 'i_robot': case 'i_pluck': case 'i_lead': {
        th.inst = op.slice(2) as Instrument;
        this.note(th, 0, { dur: 1 }); this.note(th, 4, { dur: 1 }).at = this.tickDur * 0.5;
        this.text(th, `♪ ${th.inst}`, { size: 26 });
        if (op === 'i_robot') { this.creature(th, '🤖', 'robot', 'BEEP BOOP', { kind: 'pop' }); th.voicePitch = 0.1; }
        break;
      }
      // ---------- music ----------
      case 'fast': th.speed = Math.min(4, th.speed * 2); this.sfx(th, 'sweep', 0.4, 2); this.particles(th, 'warp', 20); break;
      case 'slow': th.speed = Math.max(0.25, th.speed / 2); this.sfx(th, 'sweep', 0.4, 0.4); break;
      case 'major': case 'minor': case 'blues': case 'spooky': case 'japan':
        this.scale = op; this.text(th, `♫ ${op.toUpperCase()}`, { size: 34 });
        for (const d of [0, 2, 4]) this.note(th, d, { inst: 'pad', dur: 4, vel: 0.35 });
        if (op === 'spooky') { this.emit({ type: 'bg', h: 280, l: 3 }, th); this.particles(th, 'emoji', 8, { ch: '👻🦇🎃' }); }
        if (op === 'japan') this.particles(th, 'emoji', 12, { ch: '🌸' });
        break;
      // ---------- hacker ----------
      case 'hack': case 'access': case 'mainframe': case 'virus': case 'download': case 'matrix': {
        const bannerText = {
          access: this.pick(['ACCESS GRANTED', 'ROOT ACCESS: GOOD BOY', 'PASSWORD: ********', 'I\'M IN.']),
          mainframe: this.pick(['MAINFRAME BREACHED', 'FIREWALL: LOL', 'TRACE BLOCKED', 'PROXY: 127.0.0.1']),
          virus: this.pick(['VIRUS DETECTED: IT\'S FRIENDLY', 'WORM.EXE IS WIGGLING', 'ANTIVIRUS ON VACATION']),
          download: 'DOWNLOADING MORE RAM',
          matrix: this.pick(['WAKE UP, NEO…', 'FOLLOW THE WHITE RABBIT 🐇', 'THERE IS NO SPOON']),
          hack: this.pick(HACK_LINES),
        }[op];
        this.emit({ type: 'banner', text: bannerText, progress: op === 'download' }, th);
        this.emit({ type: 'glitch', amt: 0.5, dur: 0.4 }, th);
        this.particles(th, 'matrix', 70 * b, { color: { h: 130, s: 100, l: 55 } });
        this.emit({ type: 'bg', h: 130 }, th);
        this.sfx(th, 'data', 0.8); this.sfx(th, op === 'access' ? 'granted' : 'computer', 0.6);
        if (op === 'virus') this.emit({ type: 'invert', dur: 0.6 }, th);
        for (let i = 0; i < 2; i++) this.emit({ type: 'log', text: this.pick(HACK_LINES) + ' ' + '█'.repeat(1 + (R() * 12 | 0)) }, th);
        break;
      }
      // ---------- creatures ----------
      case 'dog': this.creature(th, this.pick(['🐶', '🐕', '🐩']), 'bark', this.pick(['WOOF', 'WUFF', 'BORK', 'ARF']), { kind: 'run' }); this.particles(th, 'emoji', 10, { ch: '🐾' }); break;
      case 'paws': this.particles(th, 'paws', 14 * b, { ch: '🐾' }); this.drum(th, 'tom', 0.5); this.drum(th, 'hat', 0.5); break;
      case 'cat': this.creature(th, '🐱', 'meow', this.pick(['MEOW', 'MIAU', 'NYA']), { kind: 'pop' }); this.particles(th, 'emoji', 6, { ch: '🧶' }); break;
      case 'cow': this.creature(th, '🐮', 'moo', 'MOOO', { kind: 'pop' }); this.emit({ type: 'actor', kind: 'ufo', ch: '🛸', x: th.x, y: th.y - 200 }, th); break;
      case 'duck': this.creature(th, '🦆', 'quack', 'QUACK', { kind: 'run' }); break;
      case 'pig': this.creature(th, '🐷', 'oink', 'OINK', { kind: 'pop' }); break;
      case 'bird': this.creature(th, this.pick(['🐦', '🐤', '🦜']), 'chirp', 'tweet', { kind: 'fly' }); break;
      case 'fish': this.creature(th, this.pick(['🐟', '🐠', '🐡']), 'bubbles', null, { kind: 'swim' }); this.particles(th, 'bubbles', 15); break;
      case 'dino': this.creature(th, this.pick(['🦖', '🦕']), 'roar', 'RAWR', { kind: 'stomp', size: 110 }); this.emit({ type: 'view', shake: 20 }, th); break;
      case 'dragon': this.creature(th, '🐉', 'roar', null, { kind: 'fly', size: 100 }); this.particles(th, 'fire', 90); this.emit({ type: 'bg', h: 10 }, th); break;
      case 'unicorn': this.creature(th, '🦄', 'chime', null, { kind: 'run' }); th.rainbow = true; this.emit({ type: 'rainbow' }, th); this.particles(th, 'sparkle', 50); break;
      case 'ghost': this.creature(th, '👻', 'ghost', 'BOO', { kind: 'float' }); this.emit({ type: 'invert', dur: 0.4 }, th); break;
      case 'alien': this.creature(th, this.pick(['👽', '🛸', '👾']), 'ufo', null, { kind: 'ufo' }); this.particles(th, 'warp', 40); break;
      case 'robot': this.creature(th, '🤖', 'robot', 'BEEP BOOP', { kind: 'pop' }); break;
      case 'rocket': this.emit({ type: 'actor', kind: 'rocket', ch: '🚀', x: th.x, y: this.hh, ang: -90 }, th); this.sfx(th, 'rocket', 0.8); this.text(th, '3… 2… 1…', { size: 40 }); break;
      case 'ball': this.emit({ type: 'actor', kind: 'ball', ch: this.pick(['🎾', '⚽', '🏀']), x: th.x, y: th.y }, th); this.sfx(th, 'boing', 0.8); this.say(th, this.pick(['ball!', 'fetch!', 'get it!'])); break;
      case 'bone': this.particles(th, 'emoji', 24 * b, { ch: '🦴' }); this.sfx(th, 'chime', 0.7); this.text(th, '+1 BONE', { style: 'big', size: 50 }); break;
      case 'squirrel':
        this.creature(th, '🐿️', 'chirp', 'SQUIRREL!!!', { kind: 'run' });
        for (const t of this.threads) t.speed = Math.min(4, t.speed * 1.5);
        this.emit({ type: 'view', shake: 20, spin: 30 }, th); this.emit({ type: 'glitch', amt: 0.5, dur: 0.5 }, th); break;
      case 'poop': this.creature(th, '💩', 'fart', this.pick(['PFFRT', 'OOPS', 'LOL']), { kind: 'pop' }); this.particles(th, 'smoke', 20, { color: { h: 80, s: 40, l: 40 } }); break;
      case 'pizza': this.particles(th, 'emoji', 20 * b, { ch: '🍕' }); this.sfx(th, 'bloop', 0.6); this.say(th, 'yum'); break;
      case 'cake': this.creature(th, '🎂', 'party', null, { kind: 'pop' }); this.particles(th, 'confetti', 60); break;
      case 'banana': this.particles(th, 'emoji', 16 * b, { ch: '🍌' }); this.sfx(th, 'boing', 0.6, 1.5); break;
      case 'car': this.creature(th, this.pick(['🚗', '🏎️', '🚙']), 'vroom', 'VROOM', { kind: 'drive' }); break;
      case 'train': this.creature(th, '🚂', 'train', 'CHOO CHOO', { kind: 'drive' }); this.particles(th, 'smoke', 20); break;
      case 'chime': this.sfx(th, 'chime', 0.8); this.particles(th, 'sparkle', 12); break;
      case 'bark': this.sfx(th, 'bark', 0.8, 0.8 + R() * 0.4); this.text(th, tok ? tok.text.toUpperCase() : 'WOOF', { style: 'big', size: 60 }); break;
      case 'meow': this.sfx(th, 'meow', 0.8); this.text(th, 'MEOW', { size: 50 }); break;
      case 'moo': this.sfx(th, 'moo', 0.8); this.text(th, 'MOO', { size: 50 }); break;
      case 'quack': this.sfx(th, 'quack', 0.8); this.text(th, 'QUACK', { size: 50 }); break;
      case 'oink': this.sfx(th, 'oink', 0.8); break;
      case 'roar': this.sfx(th, 'roar', 0.9); this.emit({ type: 'view', shake: 18 }, th); this.text(th, 'RAWR', { style: 'big', size: 70 }); break;
      case 'fart': this.sfx(th, 'fart', 0.9); this.particles(th, 'smoke', 12, { color: { h: 80, s: 40, l: 40 } }); break;
      case 'vroom': this.sfx(th, 'vroom', 0.8); this.fwd(th, 200, true, 6); break;
      // ---------- control ----------
      case 'fork': this.fork(th); break;
      case 'random': {
        const ops: Op[] = ['circle', 'star', 'heart', 'spiral', 'rose', 'sin', 'fire', 'confetti', 'boom', 'glitch', 'spin', 'dog', 'cat', 'bubbles', 'zigzag', 'tree', 'knot', 'math', 'sparkle', 'laser', 'arp', 'flower', 'kaleido', 'tunnel'];
        this.keyword(th, this.pick(ops), 1); break;
      }
      case 'chaos':
        for (let i = 0; i < 3; i++) this.keyword(th, 'random', 1);
        this.emit({ type: 'glitch', amt: 0.9, dur: 0.6 }, th); this.emit({ type: 'view', spin: (R() - 0.5) * 80 }, th); break;
      default:
        this.letter(th, op[0] || 'a', false);
    }
  }
}

export function matchBrackets(toks: Token[]): Map<number, number> {
  const pairs = new Map<number, number>();
  const st: Record<'(' | '[', number[]> = { '(': [], '[': [] };
  toks.forEach((t, i) => {
    if (t.t !== 'sym') return;
    if (t.ch === '(' || t.ch === '[') st[t.ch].push(i);
    else if (t.ch === ')' && st['('].length) { const o = st['('].pop()!; pairs.set(o, i); pairs.set(i, o); }
    else if (t.ch === ']' && st['['].length) { const o = st['['].pop()!; pairs.set(o, i); pairs.set(i, o); }
  });
  return pairs;
}
