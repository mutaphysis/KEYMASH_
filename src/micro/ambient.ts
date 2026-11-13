// PETRI_ sound: calm and spacious. A slow pad walks through four chords in D, a quiet water bed
// breathes underneath, and every interaction in the dish plays one soft note, placed on a slow
// grid and rate limited, so a busy dish sounds like a music box, never like an alarm.
import type { AudioEngine } from '../engine/audio';
import type { SimEvent } from './sim';
import { DISH_R } from './sim';

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const BPM = 72;
const GRID = 60 / BPM / 2; // eighth notes
const BAR = 60 / BPM * 4;

interface Chord { name: string; pad: number[]; tones: number[] }
/** Dmaj9 – Bm9 – Gmaj9(#11) – A6/9: open, warm, never resolves too hard */
export const CHORDS: Chord[] = [
  { name: 'Dmaj9', pad: [50, 57, 61, 64], tones: [62, 64, 66, 69, 73, 74, 76, 78, 81, 85] },
  { name: 'Bm9', pad: [47, 54, 57, 61], tones: [59, 61, 62, 66, 69, 71, 73, 74, 78, 81] },
  { name: 'Gmaj9#11', pad: [43, 50, 54, 61], tones: [59, 61, 62, 66, 67, 69, 71, 73, 74, 79] },
  { name: 'A6/9', pad: [45, 52, 54, 59], tones: [57, 59, 61, 64, 66, 69, 71, 73, 76, 78] },
];

type Voice = 'eat' | 'divide' | 'die' | 'engulf' | 'spawn' | 'bloom' | 'bond' | 'toxic' | 'hatch' | 'extinct';
const VOICE_CAP: Partial<Record<Voice, number>> = { eat: 1, bond: 1, spawn: 1 };

export class Ambient {
  e: AudioEngine;
  bus: GainNode | null = null;
  private rev!: GainNode; private del!: GainNode;
  private padV: { g: GainNode; oscs: OscillatorNode[]; lfo: OscillatorNode } | null = null;
  private bed: { g: GainNode; src: AudioBufferSourceNode; lfo: OscillatorNode } | null = null;
  chord = 0; private nextChord = 0; private nextBubble = 0;
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
    const d = ctx.createDelay(2); d.delayTime.value = GRID * 1.5;
    const fb = ctx.createGain(); fb.gain.value = 0.38;
    const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 1700;
    this.del = ctx.createGain(); this.del.connect(d); d.connect(dlp); dlp.connect(fb); fb.connect(d); dlp.connect(bus);
    this.bus = bus;
    this.e.registerBus(bus);
    return true;
  }

  start(): void {
    if (!this.build() || !this.e.ctx || !this.bus) return;
    const t = this.e.ctx.currentTime;
    this.running = true;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setTargetAtTime(this.e.muted ? 0 : 1, t, 0.6);
    this.chord = 0; this.nextChord = t + BAR * 4; this.nextBubble = t + 3;
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

  /** first free grid slot for this voice, at most 3 voices per slot */
  private slot(v: Voice, now: number): number | null {
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

  private padTo(i: number): void {
    const ctx = this.e.ctx; if (!ctx || !this.bus) return;
    const t = ctx.currentTime; const ch = CHORDS[i % CHORDS.length]!;
    if (this.padV) {
      const old = this.padV; old.g.gain.setTargetAtTime(0, t, 1.8);
      setTimeout(() => { try { old.oscs.forEach((o) => o.stop()); old.lfo.stop(); old.g.disconnect(); } catch (e) { /* gone */ } }, 9000);
    }
    const g = ctx.createGain(); g.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 640; lp.Q.value = 0.6;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.06; const lg = ctx.createGain(); lg.gain.value = 220; lfo.connect(lg); lg.connect(lp.frequency); lfo.start(t);
    lp.connect(g); g.connect(this.bus);
    const r = ctx.createGain(); r.gain.value = 0.55; g.connect(r); r.connect(this.rev);
    const oscs: OscillatorNode[] = [];
    ch.pad.forEach((m, k) => {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator(); o.type = k === 0 ? 'sine' : 'triangle'; o.frequency.value = mtof(m); o.detune.value = det + (k - 1.5) * 2;
        const og = ctx.createGain(); og.gain.value = k === 0 ? 0.6 : 0.32; o.connect(og); og.connect(lp); o.start(t); oscs.push(o);
      }
    });
    g.gain.setTargetAtTime(0.06, t, 2.4);
    this.padV = { g, oscs, lfo };
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
  update(dt: number): void {
    this.activity *= Math.pow(0.5, dt);
    const ctx = this.e.ctx; if (!ctx || !this.running || this.e.muted || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    if (t >= this.nextChord) { this.chord = (this.chord + 1) % CHORDS.length; this.nextChord = t + BAR * 4; this.padTo(this.chord); }
    if (t >= this.nextBubble) {
      this.nextBubble = t + 2.5 + Math.random() * 5;
      const o = this.out(t, (Math.random() - 0.5) * 1.4, 0.5, 0.2, 1);
      const g = ctx.createGain(); g.gain.value = 0; g.connect(o);
      const s = this.sine(280 + Math.random() * 140, t, t + 0.12, g); s.frequency.exponentialRampToValueAtTime(900 + Math.random() * 500, t + 0.05);
      this.env(g.gain, t, 0.003, 0.035, 0.05);
    }
    for (const k of this.slots.keys()) if (k * GRID < t - 1) this.slots.delete(k);
  }

  private tone(x: number, size: number, shift = 0): number {
    const tones = CHORDS[this.chord]!.tones;
    const i = Math.max(0, Math.min(tones.length - 1, Math.floor((x / DISH_R + 1) / 2 * tones.length) + shift));
    return tones[i]! + (size < 10 ? 12 : size > 24 ? -12 : 0);
  }

  /** every simulation event may become one note */
  event(ev: SimEvent): void {
    const ctx = this.e.ctx; if (!ctx || !this.running || this.e.muted || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const pan = 'x' in ev ? ev.x / DISH_R : 'ax' in ev ? ev.ax / DISH_R : 0;
    const play = (v: Voice, f: (t: number) => void) => { const t = this.slot(v, now); if (t !== null) { f(t); this.activity = Math.min(1, this.activity + 0.15); } };
    switch (ev.type) {
      case 'eat': play('eat', (t) => this.kalimba(this.tone(ev.x, ev.size), t, 0.55 + Math.random() * 0.25, pan)); break;
      case 'divide': play('divide', (t) => { const m = this.tone(ev.x, ev.size, 2); this.glass(m, t, 0.8, pan); this.glass(m + 7, t + GRID, 0.5, -pan); }); break;
      case 'die': if (ev.cause !== 'eaten') play('die', (t) => this.wood(CHORDS[this.chord]!.pad[0]! + 12, t, 0.8, pan)); break;
      case 'engulf': play('engulf', (t) => { this.gloop(t, 0.8, pan); this.kalimba(this.tone(ev.x, ev.size) - 12, t + 0.15, 0.4, pan); }); break;
      case 'spawn': case 'hatch': play('spawn', (t) => this.drop(t, 0.6, pan, this.tone(ev.x, 12))); break;
      case 'bloom': play('bloom', (t) => { for (let i = 0; i < 5; i++) this.kalimba(this.tone(ev.x, 8, i - 2), t + i * GRID * 0.5, 0.35, pan + (i - 2) * 0.15, 0.7); }); break;
      case 'bond': play('bond', (t) => { const m = this.tone(ev.ax, 14); this.swell(m, m + 4, t, 0.7, pan); }); break;
      case 'toxic': play('toxic', (t) => this.sour(this.tone(ev.x, 8), t, 0.7, pan)); break;
      case 'extinct': play('extinct', (t) => { this.wood(CHORDS[this.chord]!.pad[0]!, t, 1, 0); this.glass(CHORDS[this.chord]!.tones[0]!, t + GRID * 2, 0.4, 0); }); break;
      default: break;
    }
  }

  /** a tap on the dish */
  touch(x: number): void {
    const ctx = this.e.ctx; if (!ctx || this.e.muted) return;
    this.drop(ctx.currentTime + 0.01, 0.8, x / DISH_R, this.tone(x, 12));
  }
}
