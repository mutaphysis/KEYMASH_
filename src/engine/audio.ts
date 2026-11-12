// KEYMASH audio: a tiny quirky synth workstation built on WebAudio. No samples.

import type { VMEvent, EventOf, DrumKind, SfxKind } from '../lang/types';

declare global { interface Window { webkitAudioContext?: typeof AudioContext } }

export type TypingKind = 'letter' | 'digit' | 'symbol' | 'emoji' | 'space' | 'enter' | 'delete';
interface SweepOpts { rev?: number; del?: number; lp?: number; bp?: number; q?: number; a?: number }

const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
const DTMF: Record<string, [number, number]> = {
  1: [697, 1209], 2: [697, 1336], 3: [697, 1477], 4: [770, 1209], 5: [770, 1336],
  6: [770, 1477], 7: [852, 1209], 8: [852, 1336], 9: [852, 1477], 0: [941, 1336],
};

export class AudioEngine {
  // nodes below exist once init() has run; every public entry point checks `this.ctx` first
  ctx: AudioContext | null = null;
  muted = false; level = 0; bass = 0;
  master!: GainNode; analyser!: AnalyserNode; fft!: Uint8Array<ArrayBuffer>;
  reverb!: ConvolverNode; revSend!: GainNode; delay!: DelayNode; delSend!: GainNode;
  noiseBuf!: AudioBuffer; distCurve!: Float32Array<ArrayBuffer>;
  ui!: GainNode; uiRev!: GainNode; uiDel!: GainNode;
  bus!: GainNode; busRev!: GainNode; busDel!: GainNode;
  voicesList: SpeechSynthesisVoice[] = []; speaking = 0; warmedUp = false; babbleUntil = 0;
  lastType = 0; typeRate = 0; typeCount = 0;
  pad: { g: GainNode; oscs: OscillatorNode[]; root: number } | null = null;
  padTimer: ReturnType<typeof setTimeout> | undefined;

  /** The context, for code that only runs after init(). */
  private get c(): AudioContext { return this.ctx!; }


  init(): void {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = 0.6;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -2; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.1;
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 256;
    // final soft clipper: nothing a dog types can make it crackle
    // odd length, so input 0 lands exactly on the centre sample (an even length adds a small DC offset)
    const clip = ctx.createWaveShaper(); const cc = new Float32Array(2049);
    for (let i = 0; i < 2049; i++) { const x = i / 1024 - 1; cc[i] = Math.tanh(x * 1.6) / Math.tanh(1.6) * 0.96; }
    clip.curve = cc; clip.oversample = '2x';
    this.master.connect(comp); comp.connect(lim); lim.connect(clip); clip.connect(this.analyser); this.analyser.connect(ctx.destination);
    this.fft = new Uint8Array(this.analyser.frequencyBinCount);

    // shared reverb + echo
    this.reverb = ctx.createConvolver(); this.reverb.buffer = this.impulse(2.6, 2.2);
    this.revSend = ctx.createGain(); this.revSend.gain.value = 0.5;
    this.revSend.connect(this.reverb); this.reverb.connect(this.master);
    this.delay = ctx.createDelay(2); this.delay.delayTime.value = 0.375;
    const fb = ctx.createGain(); fb.gain.value = 0.38;
    const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2400;
    this.delSend = ctx.createGain(); this.delSend.gain.value = 0.6;
    this.delSend.connect(this.delay); this.delay.connect(dlp); dlp.connect(fb); fb.connect(this.delay); dlp.connect(this.master);

    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.distCurve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; this.distCurve[i] = Math.tanh(x * 4); }
    // a separate, always-on lounge bus for typing sounds: warm lowpass, lots of space
    this.ui = ctx.createGain(); this.ui.gain.value = this.muted ? 0 : 1;
    const warm = this.filter('lowpass', 2600, 0.5);
    this.ui.connect(warm); warm.connect(this.master);
    this.uiRev = ctx.createGain(); this.uiRev.gain.value = 0.9; this.ui.connect(this.uiRev); this.uiRev.connect(this.revSend);
    this.uiDel = ctx.createGain(); this.uiDel.gain.value = 0.45; this.ui.connect(this.uiDel); this.uiDel.connect(this.delSend);
    this.newSession();
  }

  impulse(sec: number, decay: number): AudioBuffer {
    const ctx = this.c; const n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
    return b;
  }

  newSession(): void {
    if (!this.ctx) return;
    const old = this.bus;
    if (old) { const t = this.ctx.currentTime; old.gain.setTargetAtTime(0, t, 0.08); setTimeout(() => { try { old.disconnect(); } catch (e) {} }, 800); }
    this.bus = this.ctx.createGain(); this.bus.gain.value = this.muted ? 0 : 1;
    this.bus.connect(this.master);
    // effect sends also go through per-session gains, so stop/mute silences them too
    if (this.busRev) { const a = this.busRev, b = this.busDel; a.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08); b.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08); setTimeout(() => { try { a.disconnect(); b.disconnect(); } catch (e) {} }, 800); }
    this.busRev = this.ctx.createGain(); this.busRev.gain.value = this.muted ? 0 : 1; this.busRev.connect(this.revSend);
    this.busDel = this.ctx.createGain(); this.busDel.gain.value = this.muted ? 0 : 1; this.busDel.connect(this.delSend);
  }
  stop(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const b of [this.bus, this.busRev, this.busDel]) if (b) b.gain.setTargetAtTime(0, t, 0.05);
    this.speechStop();
  }
  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) for (const b of [this.bus, this.busRev, this.busDel, this.ui]) if (b) b.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.03);
    if (m) this.speechStop();
  }
  setBpm(bpm: number): void { if (this.ctx) this.delay.delayTime.setTargetAtTime(Math.min(1.9, 60 / bpm * 0.75), this.ctx.currentTime, 0.1); }
  get now(): number { return this.ctx ? this.ctx.currentTime : performance.now() / 1000; }

  readLevel(): number {
    if (!this.analyser) return 0;
    this.analyser.getByteFrequencyData(this.fft);
    let s = 0, bass = 0;
    for (let i = 0; i < this.fft.length; i++) { s += this.fft[i]; if (i < 6) bass += this.fft[i]; }
    this.level = s / this.fft.length / 255; this.bass = bass / 6 / 255;
    return this.level;
  }

  // ---- plumbing ----
  out(t: number, pan = 0, rev = 0.2, del = 0, dur = 2): GainNode {
    const ctx = this.c;
    const g = ctx.createGain();
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(this.bus); } else g.connect(this.bus);
    if (rev > 0) { const r = ctx.createGain(); r.gain.value = rev; g.connect(r); r.connect(this.busRev); }
    if (del > 0) { const r = ctx.createGain(); r.gain.value = del; g.connect(r); r.connect(this.busDel); }
    setTimeout(() => { try { g.disconnect(); if (p) p.disconnect(); } catch (e) {} }, (t - ctx.currentTime + dur + 3) * 1000);
    return g;
  }
  osc(type: OscillatorType, f: number, t: number, end: number, dest: AudioNode): OscillatorNode {
    const o = this.c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    o.connect(dest); o.start(t); o.stop(end); return o;
  }
  noise(t: number, dur: number, dest: AudioNode): AudioBufferSourceNode {
    const s = this.c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    s.connect(dest); s.start(t, Math.random() * 1.5); s.stop(t + dur); return s;
  }
  env(param: AudioParam, t: number, a: number, peak: number, d: number, sus = 0.0001): void {
    param.cancelScheduledValues(t);
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(peak, t + a);
    param.exponentialRampToValueAtTime(Math.max(0.0001, sus), t + a + d);
  }
  filter(type: BiquadFilterType, f: number, q = 1): BiquadFilterNode { const b = this.c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
  gain(v = 1): GainNode { const g = this.c.createGain(); g.gain.value = v; return g; }

  // ---- dispatcher ----
  play(e: VMEvent, t: number, tickDur: number): void {
    if (!this.ctx || this.muted) return;
    t = Math.max(t, this.ctx.currentTime + 0.005);
    try {
      switch (e.type) {
        case 'note': return this.note(e, t, tickDur);
        case 'drum': return this.drum(e.kind, t, e.vel ?? 0.8, e.pan || 0);
        case 'sfx': return this.sfx(e.kind, t, e.vel ?? 0.7, e.p ?? 1, e.pan || 0);
        case 'dtmf': return this.dtmf(e.digits, t, e.pan || 0);
      }
    } catch (err) { /* sound is best-effort */ }
  }

  note(e: Omit<EventOf<'note'>, 'dt' | 'glide' | 'vib' | 'echo'> & Partial<Pick<EventOf<'note'>, 'glide' | 'vib' | 'echo'>>, t: number, tickDur: number): void {
    const ctx = this.c;
    const f = mtof(e.midi);
    const dur = Math.max(0.05, (e.dur ?? 1.5) * tickDur);
    const v = Math.min(1, e.vel ?? 0.5) * 0.32;
    const pan = e.pan || 0;
    const out = this.out(t, pan, e.inst === 'pad' ? 0.45 : 0.22, e.echo ? 0.5 : 0.08, dur + 2);
    const end = t + dur + 1.2;
    const setF = (o: OscillatorNode): OscillatorNode => {
      if (e.glide) { o.frequency.setValueAtTime(mtof(e.midi - e.glide), t); o.frequency.exponentialRampToValueAtTime(f, t + Math.min(0.3, dur * 0.6)); }
      if (e.vib) { const l = ctx.createOscillator(); l.frequency.value = 6.5; const lg = this.gain(25); l.connect(lg); lg.connect(o.detune); l.start(t); l.stop(end); }
      return o;
    };
    switch (e.inst) {
      case 'bass': {
        const lp = this.filter('lowpass', 900, 6); const g = this.gain(0); lp.connect(g); g.connect(out);
        setF(this.osc('sawtooth', f, t, end, lp)); setF(this.osc('square', f / 2, t, end, lp));
        lp.frequency.setValueAtTime(1400, t); lp.frequency.exponentialRampToValueAtTime(180, t + 0.25);
        this.env(g.gain, t, 0.005, v * 1.3, dur + 0.15); break;
      }
      case 'bell': {
        const g = this.gain(0); g.connect(out);
        const c = setF(this.osc('sine', f, t, end + 1, g));
        const m = this.osc('sine', f * 3.5, t, end + 1, this.gain(0)); const mg = this.gain(f * 2.2);
        m.disconnect(); m.connect(mg); mg.connect(c.frequency);
        mg.gain.setValueAtTime(f * 3, t); mg.gain.exponentialRampToValueAtTime(1, t + 1.2);
        this.env(g.gain, t, 0.002, v * 1.1, 1.6); break;
      }
      case 'chip': {
        const g = this.gain(0); g.connect(out);
        const o = setF(this.osc('square', f, t, end, g));
        o.frequency.setValueAtTime(f * 2, t); o.frequency.setValueAtTime(f, t + 0.03);
        this.env(g.gain, t, 0.002, v * 0.6, Math.min(0.4, dur)); break;
      }
      case 'lead': {
        const lp = this.filter('lowpass', 2600, 3); const g = this.gain(0); lp.connect(g); g.connect(out);
        const a = setF(this.osc('sawtooth', f, t, end, lp)); a.detune.value = -9;
        const b = setF(this.osc('sawtooth', f, t, end, lp)); b.detune.value = 9;
        this.env(g.gain, t, 0.01, v * 0.8, dur + 0.3); break;
      }
      case 'pad': {
        const lp = this.filter('lowpass', 1300, 1); const g = this.gain(0); lp.connect(g); g.connect(out);
        for (const d of [-14, 0, 13]) { const o = setF(this.osc('sawtooth', f, t, end + 1.5, lp)); o.detune.value = d; }
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v * 0.55, t + 0.25);
        g.gain.setTargetAtTime(0.0001, t + dur, 0.5); break;
      }
      case 'organ': {
        const g = this.gain(0); g.connect(out);
        [[1, 0.5], [2, 0.3], [3, 0.18], [4, 0.1]].forEach(([h, a]) => { const gg = this.gain(a); gg.connect(g); setF(this.osc('sine', f * h, t, end, gg)); });
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.01); g.gain.setTargetAtTime(0.0001, t + dur, 0.06); break;
      }
      case 'piano': {
        const g = this.gain(0); g.connect(out);
        setF(this.osc('triangle', f, t, end, g)); const h = this.gain(0.3); h.connect(g); setF(this.osc('sine', f * 2, t, end, h));
        this.env(g.gain, t, 0.002, v * 1.1, 1.1); break;
      }
      case 'robot': {
        const bp = this.filter('bandpass', f * 2, 3); const g = this.gain(0); const rm = this.gain(0);
        bp.connect(rm); rm.connect(g); g.connect(out);
        setF(this.osc('square', f, t, end, bp));
        const l = this.osc('square', 45, t, end, this.gain(0)); l.disconnect(); l.connect(rm.gain);
        this.env(g.gain, t, 0.005, v * 1.4, dur + 0.1); break;
      }
      default: { // pluck
        const lp = this.filter('lowpass', 4000, 5); const g = this.gain(0); lp.connect(g); g.connect(out);
        setF(this.osc('sawtooth', f, t, end, lp));
        lp.frequency.setValueAtTime(5000, t); lp.frequency.exponentialRampToValueAtTime(350, t + 0.3);
        this.env(g.gain, t, 0.003, v, Math.max(0.25, dur * 0.9));
      }
    }
  }

  drum(kind: DrumKind, t: number, vel: number, pan: number): void {
    const v = Math.min(1.2, vel);
    switch (kind) {
      case 'kick': {
        const out = this.out(t, pan * 0.2, 0.05, 0, 1);
        const g = this.gain(0); g.connect(out);
        const o = this.osc('sine', 160, t, t + 0.5, g); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
        this.env(g.gain, t, 0.002, v * 0.95, 0.42);
        const c = this.gain(0); c.connect(out); const hp = this.filter('highpass', 3000); hp.connect(c);
        this.noise(t, 0.02, hp); this.env(c.gain, t, 0.001, v * 0.2, 0.015); break;
      }
      case 'snare': {
        const out = this.out(t, pan, 0.25, 0, 1);
        const n = this.gain(0); const bp = this.filter('bandpass', 1900, 0.7); bp.connect(n); n.connect(out);
        this.noise(t, 0.3, bp); this.env(n.gain, t, 0.002, v * 0.6, 0.2);
        const g = this.gain(0); g.connect(out); this.osc('triangle', 190, t, t + 0.2, g); this.env(g.gain, t, 0.002, v * 0.4, 0.1); break;
      }
      case 'hat': {
        const out = this.out(t, pan, 0.1, 0, 0.5);
        const n = this.gain(0); const hp = this.filter('highpass', 8000, 1); hp.connect(n); n.connect(out);
        this.noise(t, 0.08, hp); this.env(n.gain, t, 0.001, v * 0.35, 0.05); break;
      }
      case 'clap': {
        const out = this.out(t, pan, 0.35, 0, 1);
        const n = this.gain(0); const bp = this.filter('bandpass', 1150, 1.2); bp.connect(n); n.connect(out);
        this.noise(t, 0.3, bp);
        n.gain.setValueAtTime(0.0001, t);
        for (const k of [0, 0.011, 0.022]) { n.gain.setValueAtTime(v * 0.7, t + k); n.gain.exponentialRampToValueAtTime(0.05, t + k + 0.01); }
        n.gain.setValueAtTime(v * 0.6, t + 0.033); n.gain.exponentialRampToValueAtTime(0.0001, t + 0.2); break;
      }
      case 'tom': {
        const out = this.out(t, pan, 0.2, 0, 1);
        const g = this.gain(0); g.connect(out);
        const o = this.osc('sine', 230, t, t + 0.4, g); o.frequency.exponentialRampToValueAtTime(95, t + 0.3);
        this.env(g.gain, t, 0.002, v * 0.7, 0.3); break;
      }
      case 'crash': {
        const out = this.out(t, pan, 0.4, 0, 2);
        const n = this.gain(0); const hp = this.filter('highpass', 3500, 0.5); hp.connect(n); n.connect(out);
        this.noise(t, 1.6, hp); this.env(n.gain, t, 0.002, v * 0.35, 1.3); break;
      }
    }
  }

  // a quick helper for pitch-swept tones
  sweep(type: OscillatorType, f0: number, f1: number, t: number, dur: number, vel: number, pan: number, o: SweepOpts = {}): { osc: OscillatorNode; g: GainNode; dest: GainNode | BiquadFilterNode } {
    const out = this.out(t, pan, o.rev ?? 0.25, o.del ?? 0.1, dur + 1);
    const g = this.gain(0); let dest: GainNode | BiquadFilterNode = g;
    if (o.lp) { const lp = this.filter('lowpass', o.lp, o.q || 1); lp.connect(g); dest = lp; }
    if (o.bp) { const bp = this.filter('bandpass', o.bp, o.q || 3); bp.connect(g); dest = bp; }
    g.connect(out);
    const osc = this.osc(type, f0, t, t + dur + 0.05, dest);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    this.env(g.gain, t, o.a ?? 0.005, vel, dur);
    return { osc, g, dest };
  }
  noiseSweep(f0: number, f1: number, t: number, dur: number, vel: number, pan: number, type: BiquadFilterType = 'bandpass', q = 2, o: SweepOpts = {}): void {
    const out = this.out(t, pan, o.rev ?? 0.3, o.del ?? 0, dur + 1);
    const g = this.gain(0); const f = this.filter(type, f0, q); f.connect(g); g.connect(out);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    this.noise(t, dur + 0.05, f);
    this.env(g.gain, t, o.a ?? 0.01, vel, dur);
  }

  sfx(kind: SfxKind | 'unknown', t: number, vel: number, p: number, pan: number): void {
    const v = Math.min(1, vel) * 0.5; const R = Math.random;
    switch (kind) {
      case 'data': for (let i = 0; i < 7; i++) this.sweep('square', 300 + R() * 2400, 300 + R() * 2400, t + i * 0.028, 0.025, v * 0.35, pan, { rev: 0.05 }); break;
      case 'computer': for (let i = 0; i < 12; i++) this.sweep('sine', 600 + (R() * 8 | 0) * 220, 600 + (R() * 8 | 0) * 220, t + i * 0.06, 0.05, v * 0.4, pan, { rev: 0.1 }); break;
      case 'granted': [0, 4, 7, 12].forEach((s, i) => this.sweep('square', 523 * 2 ** (s / 12), 523 * 2 ** (s / 12), t + i * 0.08, 0.12, v * 0.4, pan, { lp: 3000 })); break;
      case 'spawn': this.sweep('triangle', 200, 1600, t, 0.18, v, pan); this.sweep('triangle', 300, 2400, t + 0.05, 0.15, v * 0.6, -pan); break;
      case 'boing': { const s = this.sweep('sine', 140 * p, 700 * p, t, 0.35, v * 1.2, pan); const l = this.c.createOscillator(); l.frequency.value = 18; const lg = this.gain(60); l.connect(lg); lg.connect(s.osc.frequency); l.start(t); l.stop(t + 0.4); break; }
      case 'ooh': { const f = 220 * p; this.sweep('sawtooth', f, f * 1.05, t, 0.6, v * 0.7, pan, { bp: 700, q: 4, a: 0.08, rev: 0.5 }); break; }
      case 'rumble': this.noiseSweep(160, 50, t, 0.9, v * 1.4, pan, 'lowpass', 1); this.sweep('sine', 55, 38, t, 0.8, v, pan); break;
      case 'sweep': this.noiseSweep(300 * p, 4000 * p, t, 0.35, v * 0.7, pan, 'bandpass', 4); break;
      case 'whoosh': this.noiseSweep(250 * p, 3500 * p, t, 0.3, v, pan, 'bandpass', 2, { a: 0.25, rev: 0.4 }); this.noiseSweep(3500 * p, 300, t + 0.3, 0.4, v * 0.6, -pan, 'bandpass', 2); break;
      case 'chirp': this.sweep('sine', 2200, 3600, t, 0.06, v * 0.6, pan); this.sweep('sine', 2400, 3900, t + 0.09, 0.06, v * 0.6, pan); break;
      case 'zap': this.sweep('sawtooth', 3200, 60, t, 0.18, v, pan, { rev: 0.2 }); this.noiseSweep(6000, 500, t, 0.1, v * 0.5, pan, 'highpass', 1); break;
      case 'laser': this.sweep('square', 1800, 110, t, 0.3, v * 0.8, pan, { lp: 5000, rev: 0.4, del: 0.3 }); break;
      case 'gliss': {
        const up = p >= 0; const n = Math.min(12, Math.abs(p) * 2 + 2);
        for (let i = 0; i < n; i++) { const s = (up ? i : n - i) * 2; this.sweep('triangle', 440 * 2 ** (s / 12), 440 * 2 ** (s / 12), t + i * 0.025, 0.08, v * 0.4, pan + (i / n - 0.5) * 0.6); }
        break;
      }
      case 'question': this.sweep('sine', 400, 900, t, 0.25, v * 0.6, pan); break;
      case 'explode':
        this.noiseSweep(3000, 80, t, 1.1, v * 1.6, pan, 'lowpass', 1, { rev: 0.5 });
        this.sweep('sine', 120, 30, t, 0.6, v * 1.4, pan); break;
      case 'chime': [0, 7, 12, 19].forEach((s, i) => this.sweep('sine', 1046 * p * 2 ** (s / 12), 1046 * p * 2 ** (s / 12), t + i * 0.05, 0.8, v * 0.35, pan + i * 0.1, { rev: 0.6, del: 0.3 })); break;
      case 'crunch': {
        const out = this.out(t, pan, 0.1, 0, 1); const ws = this.c.createWaveShaper(); ws.curve = this.distCurve;
        const g = this.gain(0); ws.connect(g); g.connect(out);
        const o = this.osc('square', 80 + R() * 200, t, t + 0.3, ws);
        for (let i = 0; i < 8; i++) o.frequency.setValueAtTime(60 + R() * 1200, t + i * 0.03);
        this.env(g.gain, t, 0.001, v * 0.5, 0.25); break;
      }
      case 'kaching': this.sweep('square', 2093, 2093, t, 0.08, v * 0.4, pan, { lp: 6000 }); this.sweep('square', 2637, 2637, t + 0.08, 0.5, v * 0.4, pan, { lp: 6000, rev: 0.5 }); this.noiseSweep(9000, 6000, t, 0.15, v * 0.4, pan, 'highpass', 1); break;
      case 'fire': this.noiseSweep(600, 200, t, 1.2, v * 0.9, pan, 'lowpass', 0.5, { a: 0.2 }); for (let i = 0; i < 10; i++) this.noiseSweep(3000, 2000, t + R() * 1, 0.02, v * 0.6, pan, 'bandpass', 3); break;
      case 'rain': for (let i = 0; i < 25; i++) this.sweep('sine', 1500 + R() * 2500, 800 + R() * 800, t + R() * 1.5, 0.03, v * 0.2, (R() - 0.5) * 1.5, { rev: 0.4 }); break;
      case 'party': for (let i = 0; i < 4; i++) this.sweep('square', 300 + i * 150, 900 + i * 300, t + i * 0.09, 0.08, v * 0.35, pan, { lp: 3000 }); this.drum('crash', t, vel * 0.7, pan); break;
      case 'whistle': this.sweep('sine', 900, 2400, t, 0.9, v * 0.5, pan, { a: 0.1, rev: 0.4 }); this.sfx('explode', t + 1, vel * 0.6, 1, pan); break;
      case 'bubbles': for (let i = 0; i < 8; i++) this.sweep('sine', 300 + R() * 300, 900 + R() * 900, t + i * 0.07 + R() * 0.05, 0.06, v * 0.5, (R() - 0.5), { rev: 0.3 }); break;
      case 'warp': this.sweep('sawtooth', 60, 2000, t, 1.2, v * 0.6, pan, { lp: 3000, q: 8, a: 0.2, rev: 0.5 }); break;
      case 'bloop': this.sweep('sine', 500 * p, 120 * p, t, 0.15, v * 1.2, pan); break;
      case 'drop': {
        const out = this.out(t, 0, 0.1, 0, 2); const lp = this.filter('lowpass', 300, 12); const g = this.gain(0); lp.connect(g); g.connect(out);
        const o = this.osc('sawtooth', 55, t, t + 1.4, lp); this.osc('square', 55.5, t, t + 1.4, lp);
        o.frequency.exponentialRampToValueAtTime(40, t + 1.3);
        for (let i = 0; i < 8; i++) { lp.frequency.setValueAtTime(200, t + i * 0.16); lp.frequency.exponentialRampToValueAtTime(2400, t + i * 0.16 + 0.08); lp.frequency.exponentialRampToValueAtTime(200, t + i * 0.16 + 0.16); }
        this.env(g.gain, t, 0.01, v * 1.2, 1.3); break;
      }
      case 'siren': { const s = this.sweep('square', 650, 650, t, 1.6, v * 0.35, pan, { lp: 2500, a: 0.02 }); for (let i = 0; i < 4; i++) { s.osc.frequency.setValueAtTime(650, t + i * 0.4); s.osc.frequency.linearRampToValueAtTime(950, t + i * 0.4 + 0.2); } break; }
      case 'bark': {
        // two barks: a formant-filtered saw burst with a noise edge
        for (const k of [0, 0.19]) {
          const f0 = (380 + R() * 60) * p;
          this.sweep('sawtooth', f0, f0 * 0.6, t + k, 0.12, v * 1.6, pan, { bp: 900 * p, q: 2, a: 0.004, rev: 0.25 });
          this.sweep('sawtooth', f0 * 0.5, f0 * 0.35, t + k, 0.12, v * 1.2, pan, { bp: 500, q: 3, a: 0.004 });
          this.noiseSweep(2500, 800, t + k, 0.08, v * 0.8, pan, 'bandpass', 2);
        }
        break;
      }
      case 'meow': {
        const s = this.sweep('sawtooth', 520 * p, 420 * p, t, 0.55, v * 0.9, pan, { bp: 900, q: 3, a: 0.05 });
        s.osc.frequency.cancelScheduledValues(t); s.osc.frequency.setValueAtTime(480 * p, t); s.osc.frequency.linearRampToValueAtTime(760 * p, t + 0.2); s.osc.frequency.linearRampToValueAtTime(400 * p, t + 0.55);
        (s.dest as BiquadFilterNode).frequency.setValueAtTime(600, t); (s.dest as BiquadFilterNode).frequency.linearRampToValueAtTime(1500, t + 0.2); (s.dest as BiquadFilterNode).frequency.linearRampToValueAtTime(700, t + 0.55); break;
      }
      case 'moo': { const s = this.sweep('sawtooth', 120, 95, t, 0.9, v * 1.2, pan, { lp: 400, q: 4, a: 0.1 }); (s.dest as BiquadFilterNode).frequency.linearRampToValueAtTime(900, t + 0.4); (s.dest as BiquadFilterNode).frequency.linearRampToValueAtTime(300, t + 0.9); break; }
      case 'quack': for (const k of [0, 0.16]) this.sweep('square', 420, 300, t + k, 0.1, v, pan, { bp: 1100, q: 4 }); break;
      case 'oink': for (const k of [0, 0.12]) { this.sweep('sawtooth', 260, 180, t + k, 0.09, v, pan, { bp: 800, q: 6 }); this.noiseSweep(900, 500, t + k, 0.08, v * 0.6, pan, 'bandpass', 5); } break;
      case 'roar': {
        const out = this.out(t, pan, 0.4, 0, 2); const ws = this.c.createWaveShaper(); ws.curve = this.distCurve; const lp = this.filter('lowpass', 900, 2); const g = this.gain(0);
        ws.connect(lp); lp.connect(g); g.connect(out);
        const o = this.osc('sawtooth', 90, t, t + 1.2, ws); o.frequency.linearRampToValueAtTime(120, t + 0.3); o.frequency.exponentialRampToValueAtTime(55, t + 1.1);
        this.noise(t, 1.1, ws); this.env(g.gain, t, 0.08, v * 0.9, 1); break;
      }
      case 'fart': {
        const out = this.out(t, pan, 0.15, 0, 1.5); const lp = this.filter('lowpass', 300, 3); const g = this.gain(0); lp.connect(g); g.connect(out);
        const o = this.osc('sawtooth', 95, t, t + 0.7, lp); o.frequency.exponentialRampToValueAtTime(60, t + 0.6);
        const l = this.c.createOscillator(); l.frequency.value = 23; const lg = this.gain(30); l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + 0.7);
        this.env(g.gain, t, 0.02, v * 1.6, 0.6); break;
      }
      case 'vroom': { const s = this.sweep('sawtooth', 50, 160, t, 0.8, v, pan, { lp: 700, q: 3 }); s.osc.frequency.exponentialRampToValueAtTime(90, t + 1); break; }
      case 'robot': ['b', 'p'].forEach((_, i) => this.note({ type: 'note', inst: 'robot', midi: 60 + i * 7, dur: 2, vel: 0.9, pan }, t + i * 0.18, 0.12)); break;
      case 'ghost': { const s = this.sweep('sine', 500, 300, t, 1.4, v * 0.6, pan, { a: 0.3, rev: 0.8, del: 0.4 }); const l = this.c.createOscillator(); l.frequency.value = 5; const lg = this.gain(40); l.connect(lg); lg.connect(s.osc.frequency); l.start(t); l.stop(t + 1.5); break; }
      case 'ufo': { const s = this.sweep('sine', 800, 900, t, 1.2, v * 0.5, pan, { a: 0.1, rev: 0.5 }); const l = this.c.createOscillator(); l.frequency.value = 9; const lg = this.gain(300); l.connect(lg); lg.connect(s.osc.frequency); l.start(t); l.stop(t + 1.3); break; }
      case 'rocket': this.noiseSweep(200, 1200, t, 1.6, v * 1.2, pan, 'lowpass', 1, { a: 0.4, rev: 0.4 }); this.sweep('sawtooth', 60, 300, t, 1.6, v * 0.4, pan, { lp: 600 }); break;
      case 'train': for (let i = 0; i < 2; i++) [554, 659, 784].forEach((f) => this.sweep('sawtooth', f, f * 0.98, t + i * 0.45, 0.35, v * 0.25, pan, { lp: 1800, a: 0.03, rev: 0.4 })); break;
      default: this.sweep('triangle', 400 * p, 800 * p, t, 0.1, v * 0.6, pan);
    }
  }

  dtmf(digits: string, t: number, pan: number): void {
    const s = String(digits || '').slice(0, 10);
    [...s].forEach((d, i) => {
      const pair = DTMF[d]; if (!pair) return;
      const tt = t + i * 0.075;
      for (const f of pair) this.sweep('sine', f, f, tt, 0.06, 0.12, pan, { rev: 0.05, a: 0.003 });
    });
  }

  // ---- laid-back typing sounds (edit mode) ----
  // kind: 'letter' | 'digit' | 'symbol' | 'emoji' | 'space' | 'enter' | 'delete'
  typing(kind: TypingKind, deg = 0, pan = 0, quiet = false): void {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const ctx = this.ctx; const t = ctx.currentTime + 0.01;
    // fast typing (or a dog) gets softer instead of louder
    const gap = t - (this.lastType || 0);
    if (gap < 0.035) return;
    this.typeRate = (this.typeRate || 0) * 0.8 + (gap < 0.15 ? 0.2 : 0);
    this.lastType = t;
    const v = (quiet ? 0.35 : 1) * (1 - Math.min(0.6, this.typeRate));
    const sc = [0, 3, 5, 7, 10];
    const chord = [0, 5, 3, -2][Math.floor((this.typeCount = (this.typeCount || 0) + 1) / 24) % 4];
    const midiOf = (d: number): number => 57 + chord + sc[((d % 5) + 5) % 5] + 12 * Math.floor(d / 5);
    const out = (dur: number): GainNode => {
      const g = ctx.createGain(); const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (p) { p.pan.value = Math.max(-0.8, Math.min(0.8, pan)); g.connect(p); p.connect(this.ui); } else g.connect(this.ui);
      setTimeout(() => { try { g.disconnect(); if (p) p.disconnect(); } catch (e) {} }, (dur + 3) * 1000);
      return g;
    };
    const kalimba = (midi: number, at: number, vel: number): void => {
      const f = mtof(midi); const o = out(2.5);
      const g = this.gain(0); g.connect(o);
      this.osc('sine', f, at, at + 2.2, g);
      const h = this.gain(0); h.connect(o); this.osc('sine', f * 4.02, at, at + 0.4, h);
      this.env(g.gain, at, 0.004, 0.16 * vel, 1.8);
      this.env(h.gain, at, 0.002, 0.04 * vel, 0.15);
    };
    switch (kind) {
      case 'letter': kalimba(midiOf(deg), t, v); break;
      case 'digit': kalimba(midiOf(deg) + 12, t, v * 0.7); break;
      case 'symbol': { const o = out(2); const g = this.gain(0); g.connect(o); this.osc('sine', mtof(midiOf(deg) + 24), t, t + 1.5, g); this.env(g.gain, t, 0.002, 0.05 * v, 1.2); break; }
      case 'emoji': kalimba(midiOf(deg) + 12, t, v * 0.8); kalimba(midiOf(deg + 2) + 12, t + 0.09, v * 0.6); kalimba(midiOf(deg + 4) + 12, t + 0.18, v * 0.4); break;
      case 'space': { // soft brush
        const o = out(0.5); const g = this.gain(0); const bp = this.filter('bandpass', 3500, 0.8); bp.connect(g); g.connect(o);
        this.noise(t, 0.12, bp); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05 * v, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11); break;
      }
      case 'enter': [0, 2, 4, 7].forEach((d, i) => kalimba(midiOf(d) - 12 + (i ? 12 : 0), t + i * 0.045, v * 0.8)); break;
      case 'delete': { const o = out(1); const g = this.gain(0); g.connect(o); const os = this.osc('sine', 520, t, t + 0.3, g); os.frequency.exponentialRampToValueAtTime(260, t + 0.18); this.env(g.gain, t, 0.005, 0.07 * v, 0.2); break; }
    }
    if (!quiet) this.padSwell(midiOf(0) - 12);
  }

  // a warm pad that breathes in while you type and fades when you stop
  padSwell(root: number): void {
    const ctx = this.c; const t = ctx.currentTime;
    if (!this.pad || this.pad.root !== root) {
      if (this.pad) { const old = this.pad; old.g.gain.setTargetAtTime(0.0001, t, 0.8); setTimeout(() => { try { old.oscs.forEach((o) => o.stop()); old.g.disconnect(); } catch (e) {} }, 4000); }
      const g = this.gain(0.0001); const lp = this.filter('lowpass', 700, 0.7); lp.connect(g); g.connect(this.ui);
      const oscs = [0, 7, 15].map((s, i) => { const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(root + s); o.detune.value = (i - 1) * 7; o.connect(lp); o.start(t); return o; });
      this.pad = { g, oscs, root };
    }
    this.pad.g.gain.setTargetAtTime(0.045, t, 0.6);
    clearTimeout(this.padTimer);
    this.padTimer = setTimeout(() => { if (this.pad) this.pad.g.gain.setTargetAtTime(0.0001, this.c.currentTime, 1.2); }, 2500);
  }
  padStop(): void { if (this.pad && this.ctx) this.pad.g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.3); }

  // ---- speech ----
  // Two voices:
  //  'system' – the OS text-to-speech via speechSynthesis. Real words, but the browser plays it
  //             outside WebAudio, so we can't shape its envelope (Firefox on macOS clicks at the end).
  //  'babble' – our own formant "animalese" made with WebAudio: smooth envelopes, no clicks,
  //             identical in every browser, and keysmash is gibberish anyway.
  voice: VoiceMode = defaultVoice();

  setVoice(v: VoiceMode): void { this.voice = v; try { localStorage.setItem(VOICE_KEY, v); } catch (e) { /* private mode */ } }

  speechInit(): void {
    try {
      if (!('speechSynthesis' in window)) return;
      this.voicesList = speechSynthesis.getVoices();
      speechSynthesis.onvoiceschanged = () => { this.voicesList = speechSynthesis.getVoices(); };
      this.speaking = 0;
      // iOS/Safari only speak after a speak() inside a user gesture; elsewhere skip the silent
      // warm-up utterance (it is one more stream start/stop, i.e. one more chance to click)
      if (this.voice === 'system' && isWebKit() && !this.warmedUp) {
        const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u);
        this.warmedUp = true;
      }
    } catch (e) { /* speech is optional */ }
  }

  speak(text: string, pitch = 1, rate = 1, pan = 0): void {
    if (this.muted) return;
    if (this.voice === 'babble' || !('speechSynthesis' in window)) { this.babble(text, pitch, rate, pan); return; }
    try {
      if (this.speaking >= 2) return; // don't let the dog flood the speech queue
      // end on a sentence boundary so the engine finishes with its own falling tail
      const said = /[.!?…]\s*$/.test(text) ? text : text + '.';
      const u = new SpeechSynthesisUtterance(said);
      u.pitch = Math.max(0.1, Math.min(2, pitch)); u.rate = Math.max(0.5, Math.min(1.6, rate));
      u.volume = 0.85; // a little headroom against the music
      const de = /[äöüß]/i.test(text);
      const want = de ? 'de' : (navigator.language || 'en').slice(0, 2);
      const v = this.voicesList.find((x) => x.lang && x.lang.toLowerCase().startsWith(want));
      if (v) { u.voice = v; u.lang = v.lang; }
      this.speaking++;
      let finished = false;
      const done = () => { if (finished) return; finished = true; this.speaking = Math.max(0, this.speaking - 1); };
      u.onend = done; u.onerror = done;
      setTimeout(done, 8000);
      speechSynthesis.speak(u);
    } catch (e) { /* speech is optional */ }
  }

  speechStop(): void {
    try {
      // cancelling mid-word is a hard cut too, so only cancel when something is actually queued
      if ('speechSynthesis' in window && (speechSynthesis.speaking || speechSynthesis.pending)) speechSynthesis.cancel();
    } catch (e) { /* ignore */ }
    this.speaking = 0;
    this.babbleUntil = 0;
  }

  /** WebAudio "animalese": one formant-filtered saw per utterance, every syllable shaped with setTargetAtTime. */
  babble(text: string, pitch = 1, rate = 1, pan = 0): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const chars = Array.from(text.toLowerCase()).slice(0, 48);
    const step = 0.072 / Math.max(0.5, Math.min(1.6, rate));
    const t0 = Math.max(ctx.currentTime + 0.02, this.babbleUntil); // queue behind the previous one
    if (t0 - ctx.currentTime > 2.5) return; // too much backlog: drop it, like the system voice would
    const end = t0 + chars.length * step;
    this.babbleUntil = end + 0.12;
    const f0 = 110 + Math.max(0.1, Math.min(2, pitch)) * 85;
    const out = this.out(t0, pan * 0.6, 0.25, 0.08, end - ctx.currentTime + 1);
    const g = this.gain(0); g.gain.setValueAtTime(0, t0); g.connect(out);
    const src = this.osc('sawtooth', f0, t0, end + 0.6, this.gain(0));
    src.disconnect();
    const f1 = this.filter('bandpass', 700, 5), f2 = this.filter('bandpass', 1200, 7);
    const g2 = this.gain(0.7);
    src.connect(f1); src.connect(f2); f1.connect(g); f2.connect(g2); g2.connect(g);
    // consonant hiss
    const hiss = this.gain(0); hiss.gain.setValueAtTime(0, t0); hiss.connect(out);
    const hp = this.filter('bandpass', 4200, 1.2); hp.connect(hiss);
    this.noise(t0, end - t0 + 0.6, hp);
    const question = /\?\s*$/.test(text);
    chars.forEach((c, i) => {
      const t = t0 + i * step;
      const fm = FORMANTS[stripMarks(c)];
      const contour = 1 + 0.12 * Math.sin(i * 1.7) + (question ? 0.5 * (i / chars.length) ** 2 : -0.1 * (i / chars.length));
      src.frequency.setTargetAtTime(f0 * contour * (fm ? 1 : 1.08), t, 0.012);
      if (fm) {
        f1.frequency.setTargetAtTime(fm[0], t, 0.015); f2.frequency.setTargetAtTime(fm[1], t, 0.015);
        g.gain.setTargetAtTime(0.32, t, 0.01); g.gain.setTargetAtTime(0, t + step * 0.72, 0.014);
      } else if (/\p{L}/u.test(c)) {
        f1.frequency.setTargetAtTime(450, t, 0.01); f2.frequency.setTargetAtTime(1800, t, 0.01);
        g.gain.setTargetAtTime(0.12, t, 0.008); g.gain.setTargetAtTime(0, t + step * 0.4, 0.01);
        hiss.gain.setTargetAtTime(/[szxcfh]/.test(c) ? 0.09 : 0.035, t, 0.005); hiss.gain.setTargetAtTime(0, t + step * 0.35, 0.01);
      } // spaces and punctuation: silence
    });
    // exponential approach to zero, then stop well after: no step at the end, no click
    g.gain.setTargetAtTime(0, end, 0.02); hiss.gain.setTargetAtTime(0, end, 0.02);
  }
}

export type VoiceMode = 'system' | 'babble';
const VOICE_KEY = 'keymash.voice.v1';
function isWebKit(): boolean { return /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|Edg|Firefox|FxiOS/.test(navigator.userAgent) || /iP(hone|ad|od)/.test(navigator.userAgent); }
function defaultVoice(): VoiceMode {
  try { const v = localStorage.getItem(VOICE_KEY); if (v === 'system' || v === 'babble') return v; } catch (e) { /* ignore */ }
  // Firefox on macOS clicks at the end of every system utterance; babble there by default
  if (typeof navigator !== 'undefined' && /Firefox/.test(navigator.userAgent) && /Mac/.test(navigator.platform || navigator.userAgent)) return 'babble';
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? 'system' : 'babble';
}
const stripMarks = (c: string): string => c.normalize('NFD').replace(/\p{M}/gu, '');
// rough vowel formants (F1, F2) in Hz
const FORMANTS: Record<string, [number, number]> = {
  a: [800, 1250], e: [450, 2100], i: [300, 2600], o: [520, 900], u: [340, 760], y: [300, 2300],
};

