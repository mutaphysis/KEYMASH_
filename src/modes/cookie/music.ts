// COOKIE_ sound: a small music box that follows the bakery. Each stage has its own arrangement of
// the same seeded pattern, every bakery event has one sound. All of it goes through the shared
// engine's play(), so mute and stop just work.
import type { AudioEngine } from '../../engine/audio';
import type { Panned } from '../../engine/sound';
import type { Instrument } from '../../engine/sound';
import { mulberry32 } from '../../lang/rng';
import type { Stage } from './recipe';
import type { BakeEvent } from './bakery';

const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const PENTA = [0, 2, 4, 7, 9];
/** I, vi, IV, V: root and third of each bar's chord */
const CHORDS = [
  { root: 0, third: 4 },
  { root: -3, third: 3 },
  { root: 5, third: 4 },
  { root: 7, third: 4 },
];
type Mood = 'work' | 'oven' | 'dress' | 'serve' | 'quiet';
const MOOD: Record<Stage, Mood> = {
  drop: 'work',
  roll: 'work',
  cut: 'work',
  chips: 'work',
  bake: 'oven',
  cool: 'oven',
  coat: 'dress',
  pattern: 'dress',
  toppings: 'dress',
  deco: 'dress',
  present: 'serve',
  serve: 'serve',
  sweep: 'quiet',
};

export class Jingle {
  private audio: AudioEngine;
  private root = 48;
  private bpm = 96;
  /** eight steps of chord tones (0..4); the strong ones also play while the dough is worked */
  private pattern: number[] = [0, 2, 1, 3, 2, 4, 3, 1];
  private strong: boolean[] = [true, false, false, true, false, true, false, false];
  private melody: number[] = [4, 2, 3, 0];
  private rnd: () => number = Math.random;
  private on = false;
  private mood: Mood = 'work';
  private step = 0;
  private nextT = 0;

  constructor(audio: AudioEngine) {
    this.audio = audio;
  }

  configure(seed: number): void {
    const rnd = mulberry32(seed);
    this.rnd = rnd;
    this.root = 48 + (seed % 12);
    this.bpm = 84 + ((seed >>> 4) % 24);
    this.pattern = Array.from({ length: 8 }, (_, i) => (i === 0 ? 0 : Math.floor(rnd() * 5)));
    this.strong = this.pattern.map((_, i) => i === 0 || rnd() < 0.45);
    this.melody = Array.from({ length: 8 }, () => Math.floor(rnd() * 5));
  }

  /** e.g. "D · 96 bpm", for the boot text */
  describe(): string {
    return `${NAMES[this.root % 12]} · ${this.bpm} bpm`;
  }

  private get stepDur(): number {
    return 60 / this.bpm / 4;
  }

  start(): void {
    this.on = true;
    this.step = 0;
    this.mood = 'work';
    this.nextT = this.audio.now + 0.1;
  }

  stop(): void {
    this.on = false;
  }

  stage(s: Stage): void {
    this.mood = MOOD[s];
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
        this.now({ type: 'sfx', kind: 'rumble', vel: 0.4, p: 0.6, pan: -0.5 * ev.dir });
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
        this.now({ type: 'sfx', kind: 'crunch', vel: 0.8, p: 0.8 + Math.random() * 0.5, pan: ev.pan });
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
    if (mood === 'quiet') return;
    const s = step % 16;
    const chord = CHORDS[Math.floor(step / 16) % 4]!;
    const base = this.root + chord.root;
    const tones = [0, chord.third, 7, 12, 12 + chord.third];
    const eighth = s % 2 === 0 ? (s / 2) % 8 : -1;

    if (mood === 'oven') {
      // half time: the oven hums
      if (step % 32 === 0) for (const n of [0, chord.third, 7]) this.note('pad', base + 12 + n, 30, 0.3, t);
      if (step % 32 === 0) this.note('bass', base - 12, 6, 0.4, t);
      return;
    }
    if (s === 0 || s === 8) this.note('bass', base - 12, 3, 0.45, t);
    if (eighth < 0) return;
    const tone = tones[this.pattern[eighth]!]!;
    if (mood === 'work') {
      if (this.strong[eighth]) this.note('pluck', base + 12 + tone, 2, 0.35, t);
      return;
    }
    this.note('bell', base + 24 + tone, 3, 0.3, t, 0.3, eighth % 2 ? 0.3 : -0.3);
    if (mood === 'serve' && s % 8 === 0) {
      const m = this.melody[Math.floor(step / 8) % 8]!;
      if (this.rnd() < 0.85) this.note('piano', this.root + 12 + PENTA[m]! + (m < 2 ? 12 : 0), 6, 0.4, t, 0.2);
    }
  }
}
