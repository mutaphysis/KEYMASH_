// The lab's shelf: the specimen drawer (tiles), the bench (one specimen; split view only) and the ghost that
// follows a dragged specimen. Drags start here (from a tile or the bench) or in the dish (a carried cell
// leaving it); the lab asks where a drop lands (targetAt) and lets the shelf take it (land).
import { hybridise } from '../hybrid';
import type { GeneId, Species } from '../genome';
import type { MicroRenderer } from '../render';
import { t } from '../messages';
import { Specimens } from './specimens';
import type { Entry } from './specimens';
import * as css from './lab.css';
import type { KmToast } from '../../../ui/components/toast';
import { $, ctx2d } from '../../../ui/dom';
import { iconEl } from '../../../ui/icon';

/** where a specimen can be dropped */
export type Target = { kind: 'dish'; cx: number; cy: number } | { kind: 'drawer' } | { kind: 'bench'; cross: boolean };
/** where a dragged specimen came from */
export type Source = 'cell' | 'entry' | 'bench';
/** what a tap on the shelf opens (the genome viewer) */
export type ShelfPick = { kind: 'entry'; entry: Entry } | { kind: 'bench' };
export interface ShelfHost {
  r: MicroRenderer;
  /** a specimen from the shelf dropped on the dish at a client point */
  toDish(sp: Species, cx: number, cy: number): void;
  /** is a client point inside the dish's circle (where a drop lands)? */
  inDish(cx: number, cy: number): boolean;
  /** is a species name in use (in the dish or the drawer)? */
  taken(name: string): boolean;
  /** a tile or the bench tapped without dragging */
  pick(p: ShelfPick): void;
  split(): boolean;
  /** two specimens were crossed on the bench into `h` (heard as a hybrid in the dish is) */
  crossed(h: Species, a: Species, b: Species, genes: GeneId[]): void;
}

/** a drag from a tile or the bench: it starts once the pointer has moved far enough */
interface Drag {
  from: Exclude<Source, 'cell'>;
  sp: Species;
  el: HTMLElement;
  id: number;
  cx: number;
  cy: number;
  mouse: boolean;
  started: boolean;
}

const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
/** seconds a cross on the bench takes: the parents whirl in, their DNA swirls, the hybrid pops out */
const CROSS_TIME = 1.8;
const TAU = Math.PI * 2;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number) => {
  const u = clamp01((x - a) / (b - a));
  return u * u * (3 - 2 * u);
};
/** overshoots a little and settles: the hybrid popping out */
const backOut = (q: number) => 1 + 2.7 * (q - 1) ** 3 + 1.7 * (q - 1) ** 2;
/** the bench shows sizes: the smallest species at 80 %, ramping up to the full picture for the biggest */
const benchScale = (sp: Species) => 0.8 + 0.2 * clamp01((sp.size - 6) / 30);

export class Shelf {
  readonly drawer = document.createElement('div');
  readonly benchEl = document.createElement('div');
  readonly ghost = document.createElement('canvas');
  readonly specimens = new Specimens();
  bench: Species | null = null;
  private host: ShelfHost;
  /** the round frame on the bench: the drop target, the picture in it */
  private benchBox = document.createElement('div');
  private benchCanvas = document.createElement('canvas');
  private halves: [HTMLElement, HTMLElement];
  private tiles: { entry: Entry; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }[] = [];
  private benchCtx = ctx2d(this.benchCanvas);
  /** the bench's specimen by name and size; the x that empties the bench */
  private benchLabel = document.createElement('div');
  private benchName = document.createElement('span');
  private benchSize = document.createElement('span');
  private benchDel = document.createElement('button');
  /** what the label shows, so it is only rewritten when the bench changes */
  private labelled: Species | null = null;
  private ghostCtx = ctx2d(this.ghost);
  /** what the ghost shows; null when nothing is dragged out of its place */
  private dragged: Species | null = null;
  private drag: Drag | null = null;
  private overEl: HTMLElement | null = null;
  private time = 0;
  /** a cross on the bench being shown; the bench already holds the hybrid */
  private crossing: { a: Species; b: Species; t: number } | null = null;

  constructor(host: ShelfHost) {
    this.host = host;
    this.drawer.className = css.drawer;
    this.drawer.dataset.drop = 'drawer';
    this.benchEl.className = css.bench;
    this.benchBox.className = css.benchFrame;
    this.benchBox.dataset.drop = 'bench';
    this.benchCanvas.className = css.benchCanvas;
    const half = (icon: 'reload' | 'breed', label: string) => {
      const h = document.createElement('div');
      h.className = css.half;
      const s = document.createElement('span');
      s.textContent = label;
      h.append(iconEl(icon), s);
      return h;
    };
    this.halves = [half('reload', t('labReplace')), half('breed', t('labBreed'))];
    const halves = document.createElement('div');
    halves.className = css.halves;
    halves.append(...this.halves);
    this.benchLabel.className = css.benchLabel;
    this.benchName.className = css.benchName;
    this.benchSize.className = css.benchSize;
    this.benchLabel.append(this.benchName, this.benchSize);
    this.benchLabel.hidden = true;
    this.benchBox.append(this.benchCanvas, this.benchLabel, halves);
    this.benchDel.type = 'button';
    this.benchDel.className = css.tileDel;
    this.benchDel.title = t('labClearBench');
    this.benchDel.setAttribute('aria-label', t('labClearBench'));
    this.benchDel.append(iconEl('close'));
    this.benchDel.hidden = true;
    this.benchDel.addEventListener('click', () => {
      this.bench = null;
      this.crossing = null;
    });
    const wrap = document.createElement('div');
    wrap.className = css.benchWrap;
    wrap.append(this.benchBox, this.benchDel);
    this.benchEl.append(wrap);
    this.ghost.className = css.ghost;
    this.listen(this.benchBox, () => (this.bench ? { from: 'bench', sp: this.bench } : null), { kind: 'bench' });
    this.render();
  }

  // ---------- the drawer ----------

  /** the tiles, after any change to the drawer */
  render(): void {
    this.drawer.replaceChildren();
    this.tiles = this.specimens.entries.map((entry) => {
      const el = document.createElement('div');
      el.className = css.tile;
      const canvas = document.createElement('canvas');
      canvas.className = css.tileCanvas;
      const label = document.createElement('span');
      label.className = css.tileLabel + (entry.builtIn ? '' : ' ' + css.tileName);
      label.textContent = entry.builtIn ? t(entry.sp.body) : entry.sp.name.split(' ')[0]!;
      el.append(canvas, label);
      if (!entry.builtIn) {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = css.tileDel;
        del.title = t('labDelete');
        del.setAttribute('aria-label', t('labDelete'));
        del.append(iconEl('close'));
        del.addEventListener('pointerdown', (e) => e.stopPropagation());
        del.addEventListener('click', () => {
          this.specimens.remove(entry);
          this.render();
        });
        el.append(del);
      }
      this.listen(el, () => ({ from: 'entry', sp: entry.sp }), { kind: 'entry', entry });
      this.drawer.append(el);
      return { entry, canvas, ctx: ctx2d(canvas) };
    });
  }

  /** press, then drag far enough to take the specimen along; a tap without moving opens it */
  private listen(el: HTMLElement, what: () => { from: Drag['from']; sp: Species } | null, pick: ShelfPick): void {
    el.addEventListener('pointerdown', (e) => {
      const w = what();
      if (!w || this.drag || e.button > 0) return;
      const mouse = e.pointerType === 'mouse';
      this.drag = { ...w, el, id: e.pointerId, cx: e.clientX, cy: e.clientY, mouse, started: false };
      if (mouse) el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d || d.el !== el || e.pointerId !== d.id) return;
      if (!d.started) {
        const dx = Math.abs(e.clientX - d.cx),
          dy = Math.abs(e.clientY - d.cy);
        // a finger moving along the drawer scrolls it: only across it does it take the specimen
        const along = this.host.split() ? dy : dx,
          across = this.host.split() ? dx : dy;
        if (d.mouse ? Math.hypot(dx, dy) < 6 : across < 8 || across <= along) return;
        d.started = true;
        el.setPointerCapture(e.pointerId);
      }
      this.hover(d.sp, d.from, e.clientX, e.clientY);
    });
    el.addEventListener('pointerup', (e) => {
      const d = this.drag;
      if (!d || d.el !== el || e.pointerId !== d.id) return;
      this.drag = null;
      if (!d.started) {
        this.host.pick(pick);
        return;
      }
      const target = this.targetAt(e.clientX, e.clientY, d.from);
      this.endHover();
      if (target?.kind === 'dish') this.host.toDish(d.sp, target.cx, target.cy);
      else if (target) this.land(d.sp, target);
    });
    el.addEventListener('pointercancel', () => {
      this.drag = null;
      this.endHover();
    });
  }

  // ---------- dragging ----------

  /** where a drop at a client point would land (the dish only inside its circle). Where the
   * specimen came from is no target (the bench onto itself, a tile back onto the drawer): nothing shows, nothing happens */
  targetAt(cx: number, cy: number, from: Source): Target | null {
    const el = document.elementFromPoint(cx, cy)?.closest<HTMLElement>('[data-drop]');
    switch (el?.dataset.drop) {
      case 'dish':
        return this.host.inDish(cx, cy) ? { kind: 'dish', cx, cy } : null;
      case 'drawer':
        return from === 'entry' ? null : { kind: 'drawer' };
      case 'bench': {
        if (from === 'bench') return null;
        const b = el.getBoundingClientRect();
        return { kind: 'bench', cross: !!this.bench && cx > b.left + b.width / 2 };
      }
      default:
        return null;
    }
  }

  /** the ghost follows the pointer; the place it would land is marked (the bench shows replace | cross) */
  hover(sp: Species, from: Source, cx: number, cy: number, target = this.targetAt(cx, cy, from)): void {
    this.dragged = sp;
    this.ghost.classList.add('on');
    this.ghost.style.left = cx + 'px';
    this.ghost.style.top = cy + 'px';
    const el = target?.kind === 'drawer' ? this.drawer : target?.kind === 'bench' ? this.benchBox : null;
    if (el !== this.overEl) {
      this.overEl?.classList.remove(css.over);
      el?.classList.add(css.over);
      this.overEl = el;
    }
    this.benchBox.classList.toggle('target', target?.kind === 'bench' && !!this.bench);
    this.host.r.dropping = target?.kind === 'dish';
    this.halves[0].classList.toggle('hot', target?.kind === 'bench' && !target.cross);
    this.halves[1].classList.toggle('hot', target?.kind === 'bench' && target.cross);
  }

  endHover(): void {
    this.dragged = null;
    this.ghost.classList.remove('on');
    this.overEl?.classList.remove(css.over);
    this.overEl = null;
    this.benchBox.classList.remove('target');
    this.host.r.dropping = false;
  }

  /** a specimen dropped on the drawer or the bench (never where it came from: targetAt); true when it left where it
   * came from (a cell leaves the dish) */
  land(sp: Species, target: Target): boolean {
    if (target.kind === 'drawer') {
      this.toast(t(this.specimens.add(sp) ? 'labSaved' : 'labHave'));
      this.render();
      return true;
    }
    if (target.kind !== 'bench') return false;
    if (!target.cross || !this.bench) {
      this.bench = sp;
      return true;
    }
    const h = hybridise(this.bench, sp, Math.random, (name) => this.host.taken(name));
    if (!h) {
      this.toast(t('labSame'));
      return false;
    }
    if (!this.host.r.gentle) this.crossing = { a: this.bench, b: sp, t: 0 };
    this.host.crossed(h.sp, this.bench, sp, h.genes);
    this.bench = h.sp;
    this.toast(t('labBred', { name: h.sp.name }));
    return true;
  }

  private toast(text: string): void {
    $<KmToast>('toast').show(text);
  }

  // ---------- pictures ----------

  /** every portrait, every frame: they wobble as the cells in the dish do */
  frame(dt: number): void {
    this.time += dt;
    if (this.crossing && (this.crossing.t += dt) >= CROSS_TIME) this.crossing = null;
    const d = dpr();
    for (const tile of this.tiles) this.paint(tile.canvas, tile.ctx, tile.entry.sp, 64, d);
    if (this.benchEl.offsetParent) {
      this.paintBench(d);
      this.labelBench();
    }
    if (this.dragged) this.paint(this.ghost, this.ghostCtx, this.dragged, 72, d);
  }

  /** the canvas sized and cleared; its side in canvas pixels */
  private clear(cv: HTMLCanvasElement, g: CanvasRenderingContext2D, size: number, d: number): number {
    const n = Math.max(2, Math.round(size * d));
    if (cv.width !== n || cv.height !== n) cv.width = cv.height = n;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, n, n);
    return n;
  }

  private paint(cv: HTMLCanvasElement, g: CanvasRenderingContext2D, sp: Species | null, size: number, d: number): void {
    const n = this.clear(cv, g, size, d);
    if (sp) this.host.r.portrait(g, sp, n / 2, n / 2, n * 0.26, n * 0.42, this.time, d);
  }

  /** the bench is a dish of water: its specimen sways about the middle */
  private paintBench(d: number): void {
    const g = this.benchCtx,
      n = this.clear(this.benchCanvas, g, this.benchBox.clientWidth, d),
      T = this.time,
      still = this.host.r.gentle;
    // a little above the middle: the name and size sit under it
    const x = n / 2 + (still ? 0 : Math.sin(T * 0.5) * n * 0.035),
      y = n * 0.44 + (still ? 0 : Math.sin(T * 0.37 + 1) * n * 0.03);
    if (this.crossing) this.paintCross(g, n, d, x, y);
    else if (this.bench) {
      const k = benchScale(this.bench);
      this.host.r.portrait(g, this.bench, x, y, n * 0.26 * k, n * 0.36 * k, T, d);
    }
  }

  /** the name and size under the specimen (not while a cross plays: the hybrid is named once it is out) and the x */
  private labelBench(): void {
    const sp = this.crossing ? null : this.bench;
    if (sp !== this.labelled) {
      this.labelled = sp;
      this.benchLabel.hidden = !sp;
      if (sp) {
        this.benchName.textContent = sp.name;
        this.benchName.style.color = `hsl(${sp.hue | 0} 70% 75%)`;
        this.benchSize.textContent = t('labSize', { n: Math.round(sp.size * 2) });
      }
    }
    if (this.benchDel.hidden !== !this.bench) this.benchDel.hidden = !this.bench;
  }

  /** a cross: the two parents whirl into the middle, their DNA swirls there in a wiggling double strand, and in a
   * flash the hybrid pops out */
  private paintCross(g: CanvasRenderingContext2D, n: number, d: number, cx: number, cy: number): void {
    const { a, b, t: tt } = this.crossing!,
      p = tt / CROSS_TIME,
      T = this.time,
      r = this.host.r;
    // the parents, spun in toward the middle, shrinking and fading
    const pull = clamp01(p / 0.5);
    for (const [sp, side] of [
      [a, Math.PI],
      [b, 0],
    ] as const) {
      if (pull >= 1) break;
      const ang = side + pull * pull * 7,
        rad = n * 0.22 * (1 - pull),
        k = 1 - pull * 0.6;
      g.globalAlpha = 1 - pull;
      r.portrait(g, sp, cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad, n * 0.15 * k, n * 0.2 * k, T, d);
    }
    g.globalAlpha = 1;
    // the DNA: two strands in the parents' colours on a spiral that spins faster and tightens, wiggling across each other
    const env = smooth(0.05, 0.25, p) * (1 - smooth(0.6, 0.85, p));
    if (env > 0) {
      const R = n * 0.4 * (1 - 0.65 * smooth(0.25, 0.8, p)),
        spin = T * 3 + p * p * 26,
        STEPS = 72;
      const at = (s: number, sign: 1 | -1, lag: number): [number, number] => {
        const ang = s * TAU * 1.3 + spin - lag * 9,
          rad = R * (0.2 + 0.8 * s) + sign * Math.sin(s * 24 - (T - lag) * 16) * n * 0.035;
        return [cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad];
      };
      g.globalCompositeOperation = 'lighter';
      g.lineCap = 'round';
      g.lineJoin = 'round';
      // a fainter copy a moment behind: the whoosh
      for (const [lag, alpha, width] of [
        [0.05, 0.3, 4],
        [0, 0.85, 2],
      ] as const) {
        for (const [sign, hue] of [
          [1, a.hue],
          [-1, b.hue],
        ] as const) {
          g.strokeStyle = `hsla(${hue},85%,70%,${alpha * env})`;
          g.lineWidth = width * d;
          g.beginPath();
          for (let i = 0; i <= STEPS; i++) {
            const [x, y] = at(i / STEPS, sign, lag);
            i ? g.lineTo(x, y) : g.moveTo(x, y);
          }
          g.stroke();
        }
      }
      // rungs between the strands, half in each parent's colour
      g.lineWidth = 1.5 * d;
      for (let i = 2; i < STEPS; i += 4) {
        const [x0, y0] = at(i / STEPS, 1, 0),
          [x1, y1] = at(i / STEPS, -1, 0),
          mx = (x0 + x1) / 2,
          my = (y0 + y1) / 2;
        for (const [x, y, hue] of [
          [x0, y0, a.hue],
          [x1, y1, b.hue],
        ] as const) {
          g.strokeStyle = `hsla(${hue},80%,75%,${0.5 * env})`;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(mx, my);
          g.stroke();
        }
      }
      g.globalCompositeOperation = 'source-over';
    }
    // the flash where they meet
    const flash = Math.sin(Math.PI * clamp01((p - 0.55) / 0.3));
    if (flash > 0) {
      const f = g.createRadialGradient(cx, cy, 0, cx, cy, n * 0.3);
      f.addColorStop(0, `rgba(235,255,245,${0.55 * flash})`);
      f.addColorStop(1, 'rgba(235,255,245,0)');
      g.fillStyle = f;
      g.fillRect(0, 0, n, n);
    }
    // the hybrid pops out
    const q = clamp01((p - 0.62) / 0.38);
    if (q > 0 && this.bench) {
      const k = backOut(q) * benchScale(this.bench);
      g.globalAlpha = Math.min(1, q * 3);
      r.portrait(g, this.bench, cx, cy, n * 0.26 * k, n * 0.42 * k, T, d);
      g.globalAlpha = 1;
    }
  }

  /** the names the drawer holds */
  names(): string[] {
    return this.specimens.entries.map((e) => e.sp.name);
  }
}
