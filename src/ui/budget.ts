/** Pixel budgets for a renderer's drawing target, largest first. */
export const LADDER = [1400000, 900000, 600000, 420000, 300000, 210000, 150000];
/** above this many pixels a frame must come within 24 ms; at and below it only a frame slower than 58 ms is too slow (phones are fine at 30 fps) */
const SHARP = 420000;

/**
 * A slow device draws fewer pixels: watches how fast frames come and steps down a ladder of
 * pixel budgets, never up (stepping back up would make a borderline device flicker between sizes).
 */
export class PixelBudget {
  private i: number;
  private last = 0;
  private times: number[] = [];

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

  /** call once per drawn frame; true when the budget has just stepped down */
  frame(dt: number): boolean {
    const now = performance.now();
    let down = false;
    if (dt > 0 && this.last) {
      const ms = now - this.last;
      if (ms < 500) this.times.push(ms); // a hidden tab or a breakpoint is not a slow frame
      if (this.times.length >= 30) {
        const mean = this.times.reduce((s, v) => s + v, 0) / this.times.length;
        this.times = [];
        if (mean > (this.pixels > SHARP ? 24 : 58) && this.i < this.ladder.length - 1) {
          this.i++;
          down = true;
        }
      }
    }
    this.last = now;
    return down;
  }
}
