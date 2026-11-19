/** Pixel budgets for a renderer's drawing target, largest first. */
export const LADDER = [1400000, 900000, 600000, 420000, 300000, 210000, 150000];
/** above this many pixels a frame must come within 24 ms; at and below it only a frame slower than 58 ms is too slow (phones are fine at 30 fps) */
const SHARP = 420000;
/** frames are judged in windows of this many */
const WINDOW = 30;
/** a gap this long (ms) between two frames means the page was away: a hidden tab, a breakpoint */
const GAP = 500;
/** frames after coming back that are not judged: the first ones are slow while the GPU wakes up */
const SETTLE = 30;

/**
 * A slow device draws fewer pixels: watches how fast frames come and steps down a ladder of
 * pixel budgets, never up on its own (stepping back up would make a borderline device flicker between sizes).
 * Frames while the page is away (hidden, unfocused) don't count, and coming back returns to the last budget
 * whose frames came fast enough: a throttled background window is not a slow device.
 */
export class PixelBudget {
  private i: number;
  /** the rung whose last window of frames came in fast enough; -1 until one did */
  private good = -1;
  private last = 0;
  private times: number[] = [];
  private away = false;
  /** frames still to skip after coming back */
  private settle = 0;

  constructor(
    private readonly ladder: readonly number[] = LADDER,
    start = 0,
  ) {
    this.i = Math.min(start, ladder.length - 1);
  }

  /** pixels allowed now */
  get pixels(): number {
    return this.ladder[this.i]!;
  }

  /** scale per side (at most 1) that fits w × h pixels into the budget */
  scale(w: number, h: number): number {
    return Math.min(1, Math.sqrt(this.pixels / Math.max(1, w * h)));
  }

  /** call once per drawn frame; true when the budget has just changed */
  frame(dt: number): boolean {
    const now = performance.now();
    // a hidden or unfocused page may be throttled: its frames say nothing about the device
    if (typeof document !== 'undefined' && (document.hidden || !document.hasFocus())) {
      this.away = true;
      this.times = [];
      this.last = now;
      return false;
    }
    let moved = false;
    if (this.away || (this.last && now - this.last >= GAP)) {
      this.away = false;
      this.times = [];
      this.settle = SETTLE;
      if (this.good >= 0 && this.good < this.i) {
        this.i = this.good;
        moved = true;
      }
    } else if (dt > 0 && this.last) {
      if (this.settle > 0) this.settle--;
      else this.times.push(now - this.last);
      if (this.times.length >= WINDOW) {
        const mean = this.times.reduce((s, v) => s + v, 0) / this.times.length;
        this.times = [];
        if (mean <= (this.pixels > SHARP ? 24 : 58)) this.good = this.i;
        else if (this.i < this.ladder.length - 1) {
          this.i++;
          moved = true;
        }
      }
    }
    this.last = now;
    return moved;
  }
}
