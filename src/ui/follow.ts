/** how long a line's highlight counts as being read (PETRI_ reads every line once per 0.75 s beat) */
const KEEP = 1600;
/** a smooth scroll runs this long at most; until then the view counts as already being where it goes */
const GLIDE = 900;

/**
 * Keeps the code view on what is being read. Lines (threads) run in parallel, so a new highlight only
 * moves the view when nothing else being read is in sight: chasing the newest one pulled the view back
 * and forth between lines. The scroll itself is the browser's smooth scroll, started once per move
 * (not nudged every frame), so it stays fluid while the stage is slow to draw.
 */
export class CodeFollow {
  /** the newest highlight of each line or thread */
  private reading = new Map<number, { s: HTMLElement; t: number }>();
  private goal = 0;
  private goalAt = -Infinity;
  private readonly gentle = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private readonly view: HTMLElement) {}

  /** a new program: forget what was read */
  reset(): void {
    this.reading.clear();
    this.goalAt = -Infinity;
  }

  /** a highlight has just lit this span; `by` is the line or thread reading it */
  show(span: HTMLElement | null | undefined, by = 0): void {
    if (!span) return;
    const now = performance.now(),
      v = this.view,
      h = v.clientHeight;
    this.reading.set(by, { s: span, t: now });
    if (!h) return;
    const top = now - this.goalAt < GLIDE ? this.goal : v.scrollTop;
    const seen = (s: HTMLElement) => s.offsetTop >= top + h * 0.1 && s.offsetTop + s.offsetHeight <= top + h * 0.8;
    for (const [k, r] of this.reading) {
      if (now - r.t > KEEP) this.reading.delete(k);
      else if (seen(r.s)) return;
    }
    const goal = Math.max(0, Math.min(v.scrollHeight - h, span.offsetTop - h * 0.35));
    if (Math.abs(goal - top) < 2) return;
    this.goal = goal;
    this.goalAt = now;
    v.scrollTo({ top: goal, behavior: this.gentle ? 'auto' : 'smooth' });
  }
}
