// COOKIE_ sound: a small band that follows the bakery. The dough picks the band (instruments,
// swing, tempo, harmony), the cutter the metre, the text's seed the key, the chords and the tune;
// each stage has its own arrangement of it, every bakery event has one sound. All of it goes
// through the shared engine's play(), so mute and stop just work.
import type { AudioEngine } from '../../engine/audio';
import type { Panned } from '../../engine/sound';
import type { Instrument } from '../../engine/sound';
import { mulberry32 } from '../../lang/rng';
import type { Dough, Recipe, Shape, Stage } from './recipe';
import type { BakeEvent } from './bakery';

const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const PENTA = [0, 2, 4, 7, 9];

/** a chord: root above the key, its third, and a seventh for the bands that like them */
interface Chord {
  root: number;
  third: number;
  seventh: number;
}
const M = (root: number): Chord => ({ root, third: 4, seventh: 11 });
const m = (root: number): Chord => ({ root, third: 3, seventh: 10 });
const DOM = (root: number): Chord => ({ root, third: 4, seventh: 10 });
/** four bars each */
const PROGS = {
  pop: [M(0), m(-3), M(5), M(7)], // I vi IV V
  anthem: [M(0), M(7), m(-3), M(5)], // I V vi IV
  hymn: [M(0), M(5), m(-3), M(7)], // I IV vi V
  sad: [m(-3), M(5), M(0), M(7)], // vi IV I V
  jazz: [m(2), DOM(7), M(0), m(-3)], // ii V I vi
  folk: [M(0), M(5), M(0), M(7)], // I IV I V
};
type Prog = keyof typeof PROGS;

/** who plays what: the dough's band */
interface Band {
  /** while the dough is worked */
  work: Instrument;
  /** while it is dressed */
  dress: Instrument;
  /** the tune once it is served */
  lead: Instrument;
  /** 0 straight .. 1 heavy swing: how late the off-beat eighths come */
  swing: number;
  bpm: [number, number];
  progs: Prog[];
  /** sevenths in the chords */
  sevenths: boolean;
  /** a walking bass on every beat instead of one or two notes a bar */
  walk: boolean;
  /** sleigh bells on the eighths while it is dressed and served */
  sleigh: boolean;
}
const BANDS: Record<Dough, Band> = {
  // a music box
  butter: {
    work: 'pluck',
    dress: 'bell',
    lead: 'piano',
    swing: 0,
    bpm: [88, 108],
    progs: ['pop', 'anthem', 'hymn'],
    sevenths: false,
    walk: false,
    sleigh: false,
  },
  // a sleigh ride
  ginger: {
    work: 'chip',
    dress: 'bell',
    lead: 'bell',
    swing: 0.15,
    bpm: [108, 126],
    progs: ['pop', 'folk', 'anthem'],
    sevenths: false,
    walk: false,
    sleigh: true,
  },
  // a piano bar
  cocoa: {
    work: 'piano',
    dress: 'piano',
    lead: 'piano',
    swing: 0.6,
    bpm: [84, 100],
    progs: ['jazz', 'sad'],
    sevenths: true,
    walk: true,
    sleigh: false,
  },
  // a barn dance
  oat: {
    work: 'pluck',
    dress: 'pluck',
    lead: 'organ',
    swing: 0.3,
    bpm: [96, 116],
    progs: ['folk', 'hymn'],
    sevenths: false,
    walk: false,
    sleigh: false,
  },
  // a rainy afternoon
  matcha: {
    work: 'piano',
    dress: 'chip',
    lead: 'piano',
    swing: 0.4,
    bpm: [72, 86],
    progs: ['sad', 'jazz', 'anthem'],
    sevenths: true,
    walk: false,
    sleigh: false,
  },
};
/** hearts and bells waltz, stars, trees and gingerbread men march, the rest as the seed says */
const WALTZ: Record<Shape, number> = { heart: 1, bell: 1, star: 0, tree: 0, man: 0, round: 0.4, bear: 0.4 };

type Mood = 'work' | 'oven' | 'dress' | 'serve' | 'quiet';
/** chips are not listed: they land while the dough is worked or, on a coated cookie, while it is dressed, and keep that tune */
const MOOD: Partial<Record<Stage, Mood>> = {
  drop: 'work',
  roll: 'work',
  cut: 'work',
  bake: 'oven',
  cool: 'oven',
  coat: 'dress',
  pattern: 'dress',
  toppings: 'dress',
  deco: 'dress',
  present: 'serve',
  serve: 'serve',
  sweep: 'quiet',
  done: 'quiet',
};

export class Jingle {
  private audio: AudioEngine;
  private root = 48;
  private bpm = 96;
  private band: Band = BANDS.butter;
  private prog: Chord[] = PROGS.pop;
  /** beats in a bar: 4 or 3 */
  private beats = 4;
  /** one entry per eighth of a bar: a chord tone (0..4); the strong ones also play while the dough is worked */
  private pattern: number[] = [0, 2, 1, 3, 2, 4, 3, 1];
  private strong: boolean[] = [true, false, false, true, false, true, false, false];
  private melody: number[] = [4, 2, 3, 0];
  private rnd: () => number = Math.random;
  private on = false;
  private mood: Mood = 'work';
  private step = 0;
  private nextT = 0;
  /** the music holds its breath until then (audio time) */
  private hush = 0;

  constructor(audio: AudioEngine) {
    this.audio = audio;
  }

  configure(r: Recipe): void {
    const seed = r.seed;
    const rnd = mulberry32(seed);
    this.rnd = rnd;
    const band = (this.band = BANDS[r.dough]);
    this.root = 48 + (seed % 12);
    this.bpm = band.bpm[0] + ((seed >>> 4) % (band.bpm[1] - band.bpm[0] + 1));
    this.prog = PROGS[band.progs[(seed >>> 9) % band.progs.length]!];
    this.beats = rnd() < WALTZ[r.shape] ? 3 : 4;
    const eighths = this.beats * 2;
    this.pattern = Array.from({ length: eighths }, (_, i) => (i === 0 ? 0 : Math.floor(rnd() * 5)));
    this.strong = this.pattern.map((_, i) => i === 0 || rnd() < 0.45);
    this.melody = Array.from({ length: 8 }, () => Math.floor(rnd() * 5));
  }

  /** e.g. "D · 96 bpm", "A · 112 bpm · 3/4", for the boot text */
  describe(): string {
    return `${NAMES[this.root % 12]} · ${this.bpm} bpm${this.beats === 3 ? ' · 3/4' : ''}`;
  }

  private get stepDur(): number {
    return 60 / this.bpm / 4;
  }

  start(): void {
    this.on = true;
    this.step = 0;
    this.mood = 'work';
    this.hush = 0;
    this.nextT = this.audio.now + 0.1;
  }

  stop(): void {
    this.on = false;
  }

  stage(s: Stage): void {
    this.mood = MOOD[s] ?? this.mood;
  }

  private note(inst: Instrument, midi: number, dur: number, vel: number, t: number, echo = 0, pan = 0): void {
    this.audio.play({ type: 'note', inst, midi, dur, vel, glide: 0, vib: 0, echo, pan }, t, this.stepDur);
  }

  private now(e: Panned, delay = 0): void {
    this.audio.play(e, this.audio.now + delay, this.stepDur);
  }

  event(ev: BakeEvent): void {
    if (!this.on) return;
    switch (ev.type) {
      case 'stage':
        if (ev.stage === 'bake') this.now({ type: 'sfx', kind: 'fire', vel: 0.3, p: 1 });
        break;
      case 'thud':
        this.now({ type: 'drum', kind: 'kick', vel: ev.vel });
        this.now({ type: 'sfx', kind: 'drop', vel: 0.5, p: 1 });
        break;
      case 'roll':
        this.now({ type: 'sfx', kind: 'squish', vel: ev.vel, p: ev.p, pan: ev.pan });
        break;
      case 'cut':
        this.now({ type: 'drum', kind: 'tom', vel: 0.5, pan: ev.pan });
        this.note('bell', this.root + 36, 4, 0.3, this.audio.now, 0.2, ev.pan);
        break;
      case 'chip':
      case 'place':
        this.now({ type: 'sfx', kind: 'bloop', vel: 0.35, p: 1, pan: ev.pan });
        break;
      case 'tick':
        this.now({ type: 'drum', kind: 'hat', vel: 0.2 });
        break;
      case 'ding':
        this.note('bell', 96, 24, 0.7, this.audio.now, 0.4);
        break;
      case 'burnt':
        // the sad trombone, with the music holding its breath
        this.now({ type: 'sfx', kind: 'wahwah', vel: 0.9, p: 1 }, 0.15);
        this.hush = this.audio.now + 2.8;
        break;
      case 'pour':
        this.now({ type: 'sfx', kind: 'bubbles', vel: 0.3, p: 1 });
        break;
      case 'sprinkle':
        this.note('pluck', this.root + 24 + PENTA[Math.floor(Math.random() * 5)]!, 2, 0.2, this.audio.now, 0, ev.pan);
        break;
      case 'ready':
        this.now({ type: 'sfx', kind: 'chime', vel: 0.6, p: 1 });
        [24, 28, 31].forEach((n, i) => this.note('bell', this.root + n, 8, 0.4, this.audio.now + i * 0.15, 0.3));
        break;
      case 'bite':
        // a deep crunch with a thump under it: a mouthful, not a click
        this.now({ type: 'drum', kind: 'kick', vel: 0.55, pan: ev.pan });
        this.now({ type: 'sfx', kind: 'crunch', vel: 0.8, p: 0.35 + Math.random() * 0.2, pan: ev.pan });
        break;
      case 'crumb':
        this.now({ type: 'drum', kind: 'hat', vel: 0.08 + 0.1 * ev.vel, pan: ev.pan });
        break;
      case 'gone':
        this.now({ type: 'sfx', kind: 'ooh', vel: 0.4, p: 1 });
        break;
      case 'sweep':
        this.now({ type: 'sfx', kind: 'whoosh', vel: 0.5, p: 1 });
        break;
    }
  }

  /** once per frame: schedules every step due before audio.now + 0.15 */
  update(): void {
    if (!this.on) return;
    const now = this.audio.now;
    if (this.nextT < now - 0.5) this.nextT = now; // the tab slept: no catching up
    while (this.nextT < now + 0.15) {
      this.play(this.step, this.nextT);
      this.step++;
      this.nextT += this.stepDur;
    }
  }

  private play(step: number, t: number): void {
    const mood = this.mood;
    if (mood === 'quiet' || t < this.hush) return;
    const band = this.band;
    const bar = this.beats * 4; // sixteenths
    const s = step % bar;
    const chord = this.prog[Math.floor(step / bar) % this.prog.length]!;
    const base = this.root + chord.root;
    const tones = band.sevenths ? [0, chord.third, 7, chord.seventh, 12] : [0, chord.third, 7, 12, 12 + chord.third];
    const eighth = s % 2 === 0 ? s / 2 : -1;
    // swung: every second eighth comes a little late
    const at = eighth % 2 === 1 ? t + band.swing * this.stepDur * 0.66 : t;

    if (mood === 'oven') {
      // half time: the oven hums
      if (step % (2 * bar) === 0) {
        for (const n of tones.slice(0, band.sevenths ? 4 : 3)) this.note('pad', base + 12 + n, 30, 0.3, t);
        this.note('bass', base - 12, 6, 0.4, t);
      }
      return;
    }
    if (s % 4 === 0) {
      // the bass: a walk on every beat, or the root on one (and three)
      const beat = s / 4;
      if (band.walk) this.note('bass', base - 12 + [0, tones[1]!, 7, tones[3]! - 12][beat % 4]!, 3, 0.4, t);
      else if (beat === 0 || (this.beats === 4 && beat === 2)) this.note('bass', base - 12, 3, 0.45, t);
    }
    if (eighth < 0) return;
    const tone = tones[this.pattern[eighth % this.pattern.length]!]!;
    if (mood === 'work') {
      if (this.strong[eighth % this.strong.length]) this.note(band.work, base + 12 + tone, 2, 0.35, at);
      // a waltz: oom-pah-pah, the chord on two and three
      if (this.beats === 3 && (eighth === 2 || eighth === 4))
        for (const n of [tones[1]!, 7]) this.note(band.work, base + 12 + n, 1.5, 0.18, at);
      return;
    }
    if (band.sleigh)
      this.audio.play({ type: 'drum', kind: 'hat', vel: eighth % 2 ? 0.07 : 0.12, pan: eighth % 2 ? 0.4 : -0.4 }, at, this.stepDur);
    this.note(band.dress, base + 24 + tone, 3, 0.3, at, 0.3, eighth % 2 ? 0.3 : -0.3);
    if (mood === 'serve' && s % 8 === 0) {
      const n = this.melody[Math.floor(step / 8) % 8]!;
      if (this.rnd() < 0.85) this.note(band.lead, this.root + 12 + PENTA[n]! + (n < 2 ? 12 : 0), 6, 0.4, t, 0.2);
    }
  }
}
