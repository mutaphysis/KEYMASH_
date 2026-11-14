// PETRI_ sound: calm and spacious. A slow pad walks through four chords in D, a quiet water bed
// breathes underneath, and every interaction in the dish plays one soft note, placed on a slow
// grid and rate limited, so a busy dish sounds like a music box, never like an alarm.
import type { AudioEngine } from '../../engine/audio';
import type { SimEvent } from './sim';
import { DISH_R, DIVIDE_TIME } from './sim';
import type { Species, Body } from './genome';
import { mulberry32 } from '../../lang/rng';
import { t, tl } from './messages';

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface Chord { pad: number[]; tones: number[] }
interface Palette { name: 'lydian' | 'dorian' | 'aeolian' | 'open' | 'hirajoshi'; wave: OscillatorType; cutoff: number; detune: number; chords: Chord[] }
/**
 * Five moods, all intervals relative to the culture's root. Which one a culture gets, its key,
 * tempo, feel and chord length all come from the hash of its text: the same culture always
 * sounds the same, different cultures sound different.
 */
export const PALETTES: Palette[] = [
  { name: 'lydian', wave: 'triangle', cutoff: 700, detune: 6, chords: [ // Imaj9 – vi9 – IVmaj9#11 – V6/9
    { pad: [0, 7, 11, 14], tones: [12, 14, 16, 19, 23, 24, 26, 28, 31, 35] },
    { pad: [-3, 4, 7, 11], tones: [9, 11, 12, 16, 19, 21, 23, 24, 28, 31] },
    { pad: [-7, 0, 4, 11], tones: [9, 11, 12, 16, 17, 19, 21, 23, 24, 29] },
    { pad: [-5, 2, 4, 9], tones: [7, 9, 11, 14, 16, 19, 21, 23, 26, 28] }] },
  { name: 'dorian', wave: 'sine', cutoff: 900, detune: 9, chords: [ // i9 – IV9 – bVII6/9 – i(sus)
    { pad: [0, 7, 10, 14], tones: [12, 14, 15, 19, 22, 24, 26, 27, 31, 34] },
    { pad: [-7, -3, 3, 7], tones: [12, 14, 15, 17, 19, 21, 24, 26, 27, 29] },
    { pad: [-2, 5, 7, 12], tones: [10, 12, 14, 17, 19, 22, 24, 26, 29, 31] },
    { pad: [0, 7, 12, 17], tones: [12, 14, 17, 19, 22, 24, 26, 29, 31, 34] }] },
  { name: 'aeolian', wave: 'triangle', cutoff: 480, detune: 5, chords: [ // i(add9) – bVImaj7 – bIIImaj7 – bVII
    { pad: [0, 7, 14, 15], tones: [12, 14, 15, 17, 19, 22, 24, 26, 27, 29] },
    { pad: [-4, 3, 5, 10], tones: [12, 14, 15, 17, 19, 20, 22, 24, 26, 27] },
    { pad: [3, 10, 14, 19], tones: [12, 14, 15, 17, 19, 22, 24, 26, 27, 29] },
    { pad: [-2, 5, 7, 12], tones: [10, 12, 14, 17, 19, 22, 24, 26, 29, 31] }] },
  { name: 'open', wave: 'sine', cutoff: 1100, detune: 4, chords: [ // suspended pentatonic: Isus2 – bVIIsus2 – IVsus2 – Vsus4
    { pad: [0, 7, 14, 19], tones: [12, 14, 19, 21, 24, 26, 31, 33, 36, 38] },
    { pad: [-2, 5, 12, 17], tones: [10, 12, 17, 19, 22, 24, 29, 31, 34, 36] },
    { pad: [-7, 0, 7, 12], tones: [7, 12, 14, 19, 21, 24, 26, 31, 33, 36] },
    { pad: [-5, 2, 7, 12], tones: [9, 12, 14, 19, 21, 24, 26, 31, 33, 36] }] },
  { name: 'hirajoshi', wave: 'triangle', cutoff: 620, detune: 11, chords: [ // i – bVI – v(sus) – i
    { pad: [0, 7, 14, 15], tones: [12, 14, 15, 19, 20, 24, 26, 27, 31, 32] },
    { pad: [-4, 3, 8, 15], tones: [12, 14, 15, 19, 20, 24, 26, 27, 31, 32] },
    { pad: [-5, 2, 7, 14], tones: [12, 14, 19, 20, 24, 26, 31, 32, 36, 38] },
    { pad: [0, 7, 12, 19], tones: [12, 14, 15, 19, 20, 24, 26, 27, 31, 32] }] },
];

/** every body type has its own instrument, so a culture's species are its orchestra */
type Timbre = 'felt' | 'marimba' | 'pluck' | 'fm' | 'bell' | 'vibe' | 'kalimba' | 'breath';
const TIMBRE: Record<Body, Timbre> = { amoeba: 'felt', bacillus: 'marimba', coccus: 'pluck', spirillum: 'fm', diatom: 'bell', ciliate: 'vibe', flagellate: 'kalimba', volvox: 'breath' };

type Voice = 'eat' | 'divide' | 'divideStart' | 'die' | 'engulf' | 'spawn' | 'bloom' | 'bond' | 'toxic' | 'hatch' | 'extinct' | 'touch' | 'flee';
const VOICE_CAP: Partial<Record<Voice, number>> = { eat: 1, bond: 1, spawn: 1, touch: 1, flee: 1 };

export class Ambient {
  e: AudioEngine;
  bus: GainNode | null = null;
  private rev!: GainNode; private del!: GainNode;
  private padV: { g: GainNode; oscs: OscillatorNode[]; lfo: OscillatorNode } | null = null;
  private bed: { g: GainNode; src: AudioBufferSourceNode; lfo: OscillatorNode } | null = null;
  chord = 0; private nextChord = 0; private nextBubble = 0;
  /** musical identity of the current culture (see configure) */
  palette: Palette = PALETTES[0]!; root = 50; bpm = 72; grid = 60 / 72 / 2; bars = 4;
  private cycles = 0; private delayNode: DelayNode | null = null; private rng = mulberry32(1);
  private crowd = 0;
  private slots = new Map<number, Voice[]>();
  running = false;
  /** 0..1, how lively the dish sounds right now (renderer uses it for a gentle pulse) */
  activity = 0;

  constructor(e: AudioEngine) { this.e = e; }

  private build(): boolean {
    const ctx = this.e.ctx;
    if (!ctx) return false;
    if (this.bus) return true;
    const bus = ctx.createGain(); bus.gain.value = 0;
    const warm = ctx.createBiquadFilter(); warm.type = 'lowpass'; warm.frequency.value = 5200; warm.Q.value = 0.4;
    bus.connect(warm); warm.connect(this.e.master);
    // long, dark hall
    const conv = ctx.createConvolver(); conv.buffer = this.e.impulse(6.5, 3.4);
    const revLp = ctx.createBiquadFilter(); revLp.type = 'lowpass'; revLp.frequency.value = 2600;
    this.rev = ctx.createGain(); this.rev.connect(conv); conv.connect(revLp); revLp.connect(bus);
    // dotted-eighth echo, darker on every repeat
    const d = ctx.createDelay(2); d.delayTime.value = this.grid * 1.5; this.delayNode = d;
    const fb = ctx.createGain(); fb.gain.value = 0.38;
    const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 1700;
    this.del = ctx.createGain(); this.del.connect(d); d.connect(dlp); dlp.connect(fb); fb.connect(d); dlp.connect(bus);
    this.bus = bus;
    this.e.registerBus(bus);
    return true;
  }

  /** pick key, mode, tempo, feel and chord length from the culture's hash */
  configure(seed: number): void {
    const s = seed >>> 0;
    this.palette = PALETTES[s % PALETTES.length]!;
    this.root = 43 + ((s >>> 4) % 12);
    this.bpm = 60 + ((s >>> 8) % 25);
    const triplets = (s >>> 13) % 3 === 0;
    this.grid = 60 / this.bpm / (triplets ? 3 : 2);
    this.bars = [2, 4, 4, 8][(s >>> 15) % 4]!;
    this.rng = mulberry32(s ^ (Date.now() & 0xffff)); // each run unfolds a little differently
    if (this.delayNode && this.e.ctx) this.delayNode.delayTime.setTargetAtTime(this.grid * (triplets ? 2 : 1.5), this.e.ctx.currentTime, 0.2);
  }
  private get bar(): number { return 60 / this.bpm * 4; }
  private get chordNow(): Chord { return this.palette.chords[this.chord % this.palette.chords.length]!; }
  describe(): string { return `${tl('noteNames')[this.root % 12]} ${t(this.palette.name)} · ${this.bpm} bpm`; }

  start(): void {
    if (!this.build() || !this.e.ctx || !this.bus) return;
    const t = this.e.ctx.currentTime;
    this.running = true;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setTargetAtTime(this.e.muted ? 0 : 1, t, 0.6);
    this.chord = Math.floor(this.rng() * 4); this.cycles = 0;
    this.nextChord = t + this.bar * this.bars; this.nextBubble = t + 3;
    this.slots.clear();
    this.startBed(); this.padTo(0);
  }

  stop(): void {
    this.running = false;
    const ctx = this.e.ctx; if (!ctx || !this.bus) return;
    const t = ctx.currentTime;
    this.bus.gain.setTargetAtTime(0, t, 0.35);
    const pad = this.padV, bed = this.bed; this.padV = null; this.bed = null;
    setTimeout(() => {
      try { pad?.oscs.forEach((o) => o.stop()); pad?.lfo.stop(); pad?.g.disconnect(); } catch (e) { /* gone */ }
      try { bed?.src.stop(); bed?.lfo.stop(); bed?.g.disconnect(); } catch (e) { /* gone */ }
    }, 2500);
  }

  // ---------- plumbing ----------
  private out(t: number, pan: number, rev: number, del: number, dur: number): GainNode {
    const ctx = this.e.ctx!;
    const g = ctx.createGain();
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) { p.pan.value = Math.max(-0.8, Math.min(0.8, pan)); g.connect(p); p.connect(this.bus!); } else g.connect(this.bus!);
    const r = ctx.createGain(); r.gain.value = rev; g.connect(r); r.connect(this.rev);
    if (del > 0) { const dd = ctx.createGain(); dd.gain.value = del; g.connect(dd); dd.connect(this.del); }
    setTimeout(() => { try { g.disconnect(); p?.disconnect(); r.disconnect(); } catch (e) { /* gone */ } }, (t - ctx.currentTime + dur + 2) * 1000);
    return g;
  }
  private sine(f: number, t: number, end: number, dest: AudioNode, type: OscillatorType = 'sine'): OscillatorNode {
    const o = this.e.ctx!.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.connect(dest); o.start(t); o.stop(end); return o;
  }
  private env(p: AudioParam, t: number, a: number, peak: number, d: number): void {
    p.setValueAtTime(0, t); p.linearRampToValueAtTime(peak, t + a); p.setTargetAtTime(0, t + a, d / 4);
  }

  /** long process sounds (division, dissolving) that are sounding right now: at most 3 of each */
  private busy: Record<string, number[]> = {};
  /** minimum seconds between two sounds of the same kind, so frequent things stay sparse */
  private lastAt: Record<string, number> = {};
  private gap(kind: string, now: number, min: number): boolean {
    if (now - (this.lastAt[kind] ?? -1e9) < min) return false;
    this.lastAt[kind] = now; return true;
  }

  private room(kind: string, now: number, dur: number, max = 3): boolean {
    const list = (this.busy[kind] = (this.busy[kind] ?? []).filter((end) => end > now));
    if (list.length >= max) return false;
    list.push(now + dur); return true;
  }

  /** first free grid slot for this voice, at most 3 voices per slot */
  private slot(v: Voice, now: number): number | null {
    const GRID = this.grid;
    const first = Math.ceil((now + 0.05) / GRID);
    for (let k = 0; k < 3; k++) {
      const s = first + k; const used = this.slots.get(s) ?? [];
      const same = used.filter((u) => u === v).length;
      if (used.length < 3 && same < (VOICE_CAP[v] ?? 1)) { used.push(v); this.slots.set(s, used); return s * GRID; }
    }
    return null;
  }

  // ---------- voices ----------
  /** soft kalimba: sine + a quick bell partial */
  kalimba(midi: number, t: number, vel: number, pan: number, rev = 0.5): void {
    const f = mtof(midi); const o = this.out(t, pan, rev, 0.25, 3);
    const g = this.e.ctx!.createGain(); g.gain.value = 0; g.connect(o);
    const h = this.e.ctx!.createGain(); h.gain.value = 0; h.connect(o);
    this.sine(f, t, t + 2.6, g); this.sine(f * 4.01, t, t + 0.5, h);
    this.env(g.gain, t, 0.006, 0.16 * vel, 2.2); this.env(h.gain, t, 0.003, 0.035 * vel, 0.25);
  }
  /** glass bell: inharmonic partials, long ring */
  glass(midi: number, t: number, vel: number, pan: number): void {
    const f = mtof(midi); const o = this.out(t, pan, 0.75, 0.3, 5);
    [[1, 0.12], [2.76, 0.05], [5.4, 0.022]].forEach(([k, a], i) => {
      const g = this.e.ctx!.createGain(); g.gain.value = 0; g.connect(o);
      this.sine(f * k!, t, t + 4.5, g); this.env(g.gain, t, 0.004, a! * vel, 3.6 - i);
    });
  }
  /** low wooden tone that sinks a little: a cell has died */
  wood(midi: number, t: number, vel: number, pan: number): void {
    const ctx = this.e.ctx!; const f = mtof(midi); const o = this.out(t, pan, 0.85, 0.1, 4);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const g = ctx.createGain(); g.gain.value = 0; lp.connect(g); g.connect(o);
    const osc = this.sine(f, t, t + 2.5, lp, 'triangle'); osc.frequency.exponentialRampToValueAtTime(f * 0.94, t + 1.8);
    this.env(g.gain, t, 0.02, 0.14 * vel, 1.8);
    const n = ctx.createBufferSource(); n.buffer = this.e.noiseBuf; n.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 2;
    const ng = ctx.createGain(); ng.gain.value = 0; n.connect(bp); bp.connect(ng); ng.connect(o);
    n.start(t); n.stop(t + 0.6); this.env(ng.gain, t, 0.05, 0.03 * vel, 0.4);
  }
  /** gloop: a bubble swallowed */
  gloop(t: number, vel: number, pan: number): void {
    for (const [k, f0, f1] of [[0, 360, 110], [0.11, 520, 170]] as const) {
      const o = this.out(t + k, pan, 0.4, 0, 1);
      const g = this.e.ctx!.createGain(); g.gain.value = 0; g.connect(o);
      const s = this.sine(f0, t + k, t + k + 0.3, g); s.frequency.exponentialRampToValueAtTime(f1, t + k + 0.22);
      this.env(g.gain, t + k, 0.004, 0.13 * vel, 0.2);
    }
  }
  /** water drop: a new cell arrives */
  drop(t: number, vel: number, pan: number, midi: number): void {
    const o = this.out(t, pan, 0.55, 0.3, 1.5);
    const g = this.e.ctx!.createGain(); g.gain.value = 0; g.connect(o);
    const s = this.sine(1500, t, t + 0.2, g); s.frequency.exponentialRampToValueAtTime(560, t + 0.06);
    this.env(g.gain, t, 0.002, 0.11 * vel, 0.1);
    this.kalimba(midi + 12, t + 0.02, vel * 0.35, pan, 0.6);
  }
  /** a cell rounds up and stretches: a slow swell (root + fifth) and, at the furrow, a soft stretching glide */
  divisionSound(m: number, t: number, pan: number): void {
    const ctx = this.e.ctx!;
    const D = DIVIDE_TIME;
    for (const [k, mm] of [[0, m], [1, m + 7]] as const) {
      const o = this.out(t, pan, 0.75, 0.15, D + 2);
      const g = ctx.createGain(); g.gain.value = 0; g.connect(o);
      const osc = this.sine(mtof(mm), t, t + D + 1.5, g, 'triangle');
      osc.detune.setValueAtTime(0, t); osc.detune.linearRampToValueAtTime(18, t + D * 0.6); // stretches a little sharp …
      osc.detune.linearRampToValueAtTime(0, t + D);                                          // … and relaxes at the split
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime((k ? 0.022 : 0.035), t + D * 0.45); g.gain.setTargetAtTime(0, t + D * 0.75, 0.35);
    }
    // the cleavage furrow pinching in: a breathy filtered-noise glide
    const tp = t + D * 0.55;
    const o = this.out(tp, pan, 0.6, 0, 2);
    const n = ctx.createBufferSource(); n.buffer = this.e.noiseBuf; n.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 6; bp.frequency.setValueAtTime(260, tp); bp.frequency.exponentialRampToValueAtTime(820, tp + D * 0.4);
    const ng = ctx.createGain(); ng.gain.value = 0; n.connect(bp); bp.connect(ng); ng.connect(o);
    n.start(tp); n.stop(tp + D * 0.5);
    ng.gain.setValueAtTime(0, tp); ng.gain.linearRampToValueAtTime(0.05, tp + D * 0.25); ng.gain.linearRampToValueAtTime(0, tp + D * 0.45);
  }

  /** the split: a small bubble pop, then one note per daughter, each on its own side */
  splitSound(m: number, sp: Species, t: number, pan: number, axis: number): void {
    const spread = Math.cos(axis) * 0.35;
    const o = this.out(t, pan, 0.4, 0, 1);
    const g = this.e.ctx!.createGain(); g.gain.value = 0; g.connect(o);
    const s = this.sine(240, t, t + 0.15, g); s.frequency.exponentialRampToValueAtTime(620, t + 0.05);
    this.env(g.gain, t, 0.003, 0.07, 0.06);
    this.glass(m, t + 0.02, 0.45, pan + spread);
    this.play(sp, m + 7, t + 0.02 + this.grid, 0.45, pan - spread);
  }

  /** a membrane dissolving: a low wooden tone, a soft fizz sinking for two seconds, a few faint crackles */
  dissolveSound(m: number, t: number, pan: number): void {
    const ctx = this.e.ctx!;
    this.wood(m, t, 0.75, pan);
    const tf = t + 0.4, D = 2.2;
    const o = this.out(tf, pan, 0.7, 0.1, D + 1);
    const n = ctx.createBufferSource(); n.buffer = this.e.noiseBuf; n.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.6; bp.frequency.setValueAtTime(2000, tf); bp.frequency.exponentialRampToValueAtTime(260, tf + D);
    const ng = ctx.createGain(); ng.gain.value = 0; n.connect(bp); bp.connect(ng); ng.connect(o);
    n.start(tf); n.stop(tf + D + 0.2);
    ng.gain.setValueAtTime(0, tf); ng.gain.linearRampToValueAtTime(0.03, tf + 0.6); ng.gain.linearRampToValueAtTime(0, tf + D);
    for (let i = 0; i < 6; i++) {
      const tc = tf + 0.2 + Math.random() * (D - 0.5);
      const oc = this.out(tc, pan + (Math.random() - 0.5) * 0.3, 0.5, 0, 0.5);
      const gc = ctx.createGain(); gc.gain.value = 0; gc.connect(oc);
      this.sine(1800 + Math.random() * 1600, tc, tc + 0.03, gc); this.env(gc.gain, tc, 0.001, 0.012, 0.012);
    }
  }

  /** two cells bump: a soft felt-mallet tap; the same species touching also hums a fifth */
  touchSound(m: number, t: number, vel: number, pan: number, kin: boolean): void {
    const ctx = this.e.ctx!;
    const o = this.out(t, pan, 0.45, 0.1, 1.5);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100; lp.connect(o);
    const g = ctx.createGain(); g.gain.value = 0; g.connect(lp);
    this.sine(mtof(m), t, t + 0.6, g); this.env(g.gain, t, 0.004, 0.09 * vel, 0.35);
    const h = ctx.createGain(); h.gain.value = 0; h.connect(lp);
    this.sine(mtof(m) * 2.5, t, t + 0.2, h); this.env(h.gain, t, 0.002, 0.02 * vel, 0.08);
    if (kin) { const k = ctx.createGain(); k.gain.value = 0; k.connect(lp); this.sine(mtof(m + 7), t + 0.06, t + 1.2, k); this.env(k.gain, t + 0.06, 0.05, 0.035 * vel, 0.8); }
  }

  /** a cell senses a predator and turns away: a quiet rising glide */
  fleeSound(m: number, t: number, pan: number): void {
    const o = this.out(t, pan, 0.6, 0.2, 1.5);
    const g = this.e.ctx!.createGain(); g.gain.value = 0; g.connect(o);
    const s = this.sine(mtof(m), t, t + 0.9, g); s.frequency.exponentialRampToValueAtTime(mtof(m + 5), t + 0.5);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.03, t + 0.15); g.gain.setTargetAtTime(0, t + 0.3, 0.15);
  }

  /** gentle two-note swell: two cells sharing */
  swell(m1: number, m2: number, t: number, vel: number, pan: number): void {
    for (const [m, k] of [[m1, 0], [m2, 0.18]] as const) {
      const o = this.out(t + k, pan, 0.8, 0.2, 4);
      const g = this.e.ctx!.createGain(); g.gain.value = 0; g.connect(o);
      this.sine(mtof(m), t + k, t + k + 3.4, g, 'triangle');
      g.gain.setValueAtTime(0, t + k); g.gain.linearRampToValueAtTime(0.05 * vel, t + k + 0.7); g.gain.setTargetAtTime(0, t + k + 0.9, 0.6);
    }
  }
  /** slightly sour shimmer: toxic prey */
  sour(midi: number, t: number, vel: number, pan: number): void {
    for (const m of [midi, midi + 1]) {
      const o = this.out(t, pan, 0.7, 0.2, 3);
      const g = this.e.ctx!.createGain(); g.gain.value = 0; g.connect(o);
      this.sine(mtof(m), t, t + 2.4, g); this.env(g.gain, t, 0.2, 0.035 * vel, 1.6);
    }
  }

  /** the voice of one species: its body picks the instrument, its size the register */
  play(sp: Species | null, midi: number, t: number, vel: number, pan: number): void {
    const tb: Timbre = sp ? TIMBRE[sp.body] : 'kalimba';
    if (sp?.diet === 'hunter') midi -= 12;
    const ctx = this.e.ctx!; const f = mtof(midi);
    const voice = (type: OscillatorType, ratio: number, peak: number, a: number, d: number, dest: AudioNode, end = d * 1.4 + a) => {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(dest);
      this.sine(f * ratio, t, t + end, g, type); this.env(g.gain, t, a, peak * vel, d);
      return g;
    };
    const dark = sp?.diet === 'hunter';
    switch (tb) {
      case 'kalimba': this.kalimba(midi, t, vel, pan); break;
      case 'bell': this.glass(midi, t, vel * 0.9, pan); break;
      case 'felt': { const o = this.out(t, pan, 0.55, 0.15, 3); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = dark ? 500 : 950; lp.connect(o); voice('triangle', 1, 0.2, 0.01, 1.7, lp); voice('sine', 2, 0.05, 0.01, 0.8, lp); break; }
      case 'marimba': { const o = this.out(t, pan, 0.4, 0.2, 2); voice('sine', 1, 0.2, 0.003, 0.55, o); voice('sine', 3.93, 0.05, 0.002, 0.12, o); voice('sine', 9.8, 0.015, 0.001, 0.04, o); break; }
      case 'pluck': { const o = this.out(t, pan, 0.5, 0.35, 1.5); voice('sine', 2, 0.12, 0.002, 0.35, o); voice('triangle', 4, 0.03, 0.001, 0.12, o); break; }
      case 'fm': {
        const o = this.out(t, pan, 0.65, 0.3, 3);
        const g = ctx.createGain(); g.gain.value = 0; g.connect(o);
        const car = this.sine(f, t, t + 2.6, g);
        const mod = ctx.createOscillator(); mod.frequency.value = f * 2.0; const mg = ctx.createGain(); mg.gain.setValueAtTime(f * 1.6, t); mg.gain.setTargetAtTime(f * 0.05, t, 0.25);
        mod.connect(mg); mg.connect(car.frequency); mod.start(t); mod.stop(t + 2.6);
        this.env(g.gain, t, 0.004, 0.11 * vel, 1.8); break;
      }
      case 'vibe': {
        const o = this.out(t, pan, 0.6, 0.25, 3.5);
        const trem = ctx.createGain(); trem.gain.value = 0.75; trem.connect(o);
        const lfo = ctx.createOscillator(); lfo.frequency.value = 5.2; const lg = ctx.createGain(); lg.gain.value = 0.25; lfo.connect(lg); lg.connect(trem.gain); lfo.start(t); lfo.stop(t + 3);
        voice('sine', 1, 0.17, 0.004, 2.2, trem); voice('sine', 4, 0.02, 0.002, 0.2, trem); break;
      }
      case 'breath': { const o = this.out(t, pan, 0.8, 0.2, 4); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200; lp.connect(o); voice('triangle', 1, 0.09, 0.22, 2.4, lp); voice('sine', 0.5, 0.05, 0.3, 2.4, lp); break; }
    }
  }

  private padTo(i: number): void {
    const ctx = this.e.ctx; if (!ctx || !this.bus) return;
    const t = ctx.currentTime; const ch = this.chordNow; void i;
    const P = this.palette;
    if (this.padV) {
      const old = this.padV; old.g.gain.setTargetAtTime(0, t, 1.8);
      setTimeout(() => { try { old.oscs.forEach((o) => o.stop()); old.lfo.stop(); old.g.disconnect(); } catch (e) { /* gone */ } }, 9000);
    }
    const g = ctx.createGain(); g.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = P.cutoff * (0.8 + this.crowd * 0.6); lp.Q.value = 0.6;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.06; const lg = ctx.createGain(); lg.gain.value = 220; lfo.connect(lg); lg.connect(lp.frequency); lfo.start(t);
    lp.connect(g); g.connect(this.bus);
    const r = ctx.createGain(); r.gain.value = 0.55; g.connect(r); r.connect(this.rev);
    const oscs: OscillatorNode[] = [];
    ch.pad.forEach((rel, k) => {
      const m = this.root + rel;
      for (const det of [-P.detune, P.detune]) {
        const o = ctx.createOscillator(); o.type = k === 0 ? 'sine' : P.wave; o.frequency.value = mtof(m); o.detune.value = det + (k - 1.5) * 2;
        const og = ctx.createGain(); og.gain.value = k === 0 ? 0.6 : 0.32; o.connect(og); og.connect(lp); o.start(t); oscs.push(o);
      }
    });
    g.gain.setTargetAtTime(0.06, t, 2.4);
    this.padV = { g, oscs, lfo };
    // a soft low root under every chord change
    const bo = this.out(t, 0, 0.3, 0, 8); const bg = ctx.createGain(); bg.gain.value = 0; bg.connect(bo);
    this.sine(mtof(this.root + ch.pad[0]! - 12), t, t + 8, bg);
    bg.gain.setValueAtTime(0, t); bg.gain.linearRampToValueAtTime(0.07, t + 1.2); bg.gain.setTargetAtTime(0, t + 2.5, 1.6);
  }

  private startBed(): void {
    const ctx = this.e.ctx; if (!ctx || !this.bus || this.bed) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.e.noiseBuf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 340; lp.Q.value = 0.3;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.045; const lg = ctx.createGain(); lg.gain.value = 140; lfo.connect(lg); lg.connect(lp.frequency); lfo.start(t);
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(lp); lp.connect(g); g.connect(this.bus); src.start(t);
    g.gain.setTargetAtTime(0.035, t, 2);
    this.bed = { g, src, lfo };
  }

  /** call every frame: chord changes, stray bubbles, decay of activity */
  update(dt: number, crowd = 0): void {
    this.crowd += (crowd - this.crowd) * Math.min(1, dt * 0.5);
    this.activity *= Math.pow(0.5, dt);
    const ctx = this.e.ctx; if (!ctx || !this.running || this.e.muted || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    if (t >= this.nextChord) {
      this.chord = (this.chord + 1) % this.palette.chords.length;
      if (this.chord === 0) {
        // after a full cycle the music may move to a neighbouring key
        this.cycles++;
        if (this.rng() < 0.35) { this.root += this.root > 50 ? -7 : 5; }
      }
      this.nextChord = t + this.bar * this.bars; this.padTo(this.chord);
    }
    if (t >= this.nextBubble) {
      this.nextBubble = t + 2.5 + Math.random() * 5;
      const o = this.out(t, (Math.random() - 0.5) * 1.4, 0.5, 0.2, 1);
      const g = ctx.createGain(); g.gain.value = 0; g.connect(o);
      const s = this.sine(280 + Math.random() * 140, t, t + 0.12, g); s.frequency.exponentialRampToValueAtTime(900 + Math.random() * 500, t + 0.05);
      this.env(g.gain, t, 0.003, 0.035, 0.05);
    }
    for (const k of this.slots.keys()) if (k * this.grid < t - 1) this.slots.delete(k);
  }

  private tone(x: number, size: number, shift = 0): number {
    const tones = this.chordNow.tones;
    const i = Math.max(0, Math.min(tones.length - 1, Math.floor((x / DISH_R + 1) / 2 * tones.length) + shift));
    return this.root + tones[i]! + (size < 10 ? 12 : size > 24 ? -12 : 0);
  }

  /** every simulation event may become one note */
  event(ev: SimEvent): void {
    const ctx = this.e.ctx; if (!ctx || !this.running || this.e.muted || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const pan = 'x' in ev ? ev.x / DISH_R : 'ax' in ev ? ev.ax / DISH_R : 0;
    const play = (v: Voice, f: (t: number) => void) => { const t = this.slot(v, now); if (t !== null) { f(t); this.activity = Math.min(1, this.activity + 0.15); } };
    switch (ev.type) {
      case 'eat': play('eat', (t) => this.play(ev.sp, this.tone(ev.x, ev.size), t, 0.55 + Math.random() * 0.25, pan)); break;
      case 'divideStart': { if (!this.room('divide', now, DIVIDE_TIME)) break; const t = now + 0.02; this.divisionSound(this.tone(ev.x, ev.size) - 12, t, pan); this.activity = Math.min(1, this.activity + 0.1); break; } // follows the picture, not the grid
      case 'divide': {
        // the split itself is sounded right away, so the pop lands with the picture
        if (this.room('split', now, 0.6)) this.splitSound(this.tone(ev.x, ev.size, 2), ev.sp, now + 0.02, pan, ev.axis);
        play('divide', (t) => {
        if (ev.gen % 5 === 0) [0, 2, 4].forEach((k, i) => this.play(ev.sp, this.tone(ev.x, ev.size, k), t + this.grid * (2 + i), 0.45, pan)); // a little motif for a milestone
      }); break;
      }
      case 'touch': if (this.gap('touch', now, 1.1)) play('touch', (t) => this.touchSound(this.tone(ev.x, ev.size) - 12, t, Math.min(1, 0.35 + ev.speed / 60), pan, ev.a === ev.b)); break;
      case 'flee': if (this.gap('flee', now, 2)) play('flee', (t) => this.fleeSound(this.tone(ev.x, ev.size), t, pan)); break;
      case 'die': if (ev.cause !== 'eaten' && this.room('dissolve', now, 2.6)) { const t = now + 0.02; this.dissolveSound(this.root + this.chordNow.pad[0]! + 12, t, pan); this.activity = Math.min(1, this.activity + 0.1); } break; // follows the picture
      case 'engulf': play('engulf', (t) => { this.gloop(t, 0.8, pan); this.play(ev.pred, this.tone(ev.x, ev.size) - 12, t + 0.15, 0.45, pan); }); break;
      case 'spawn': case 'hatch': play('spawn', (t) => { this.drop(t, 0.5, pan, this.tone(ev.x, 12)); this.play(ev.sp, this.tone(ev.x, ev.sp.size), t + this.grid, 0.35, pan); }); break;
      case 'bloom': play('bloom', (t) => { for (let i = 0; i < 5; i++) this.kalimba(this.tone(ev.x, 8, i - 2), t + i * this.grid * 0.5, 0.35, pan + (i - 2) * 0.15, 0.7); }); break;
      case 'bond': play('bond', (t) => { const m = this.tone(ev.ax, 14); this.swell(m, m + 4, t, 0.7, pan); }); break;
      case 'toxic': play('toxic', (t) => this.sour(this.tone(ev.x, 8), t, 0.7, pan)); break;
      case 'extinct': play('extinct', (t) => { this.wood(this.root + this.chordNow.pad[0]!, t, 1, 0); this.glass(this.root + this.chordNow.tones[0]!, t + this.grid * 2, 0.4, 0); }); break;
      default: break;
    }
  }

  /** a tap on the dish */
  touch(x: number): void {
    const ctx = this.e.ctx; if (!ctx || this.e.muted) return;
    this.drop(ctx.currentTime + 0.01, 0.8, x / DISH_R, this.tone(x, 12));
  }
}
