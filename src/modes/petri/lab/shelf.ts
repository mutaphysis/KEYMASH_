// The lab's shelf: the specimen drawer (tiles), the bench (one specimen; split view only) and the ghost that
// follows a dragged specimen. Drags start here (from a tile or the bench) or in the dish (a carried cell
// leaving it); the lab asks where a drop lands (targetAt) and lets the shelf take it (land).
import { hybridise } from '../hybrid';
import type { Species } from '../genome';
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
  /** is a species name in use (in the dish or the drawer)? */
  taken(name: string): boolean;
  /** a tile or the bench tapped without dragging */
  pick(p: ShelfPick): void;
  split(): boolean;
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
  private ghostCtx = ctx2d(this.ghost);
  /** what the ghost shows; null when nothing is dragged out of its place */
  private dragged: Species | null = null;
  private drag: Drag | null = null;
  private overEl: HTMLElement | null = null;
  private time = 0;

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
    this.benchBox.append(this.benchCanvas, halves);
    this.benchEl.append(this.benchBox);
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
      this.hover(d.sp, e.clientX, e.clientY);
    });
    el.addEventListener('pointerup', (e) => {
      const d = this.drag;
      if (!d || d.el !== el || e.pointerId !== d.id) return;
      this.drag = null;
      if (!d.started) {
        this.host.pick(pick);
        return;
      }
      const target = this.targetAt(e.clientX, e.clientY);
      this.endHover();
      if (target?.kind === 'dish') this.host.toDish(d.sp, target.cx, target.cy);
      else if (target) this.land(d.sp, target, d.from);
    });
    el.addEventListener('pointercancel', () => {
      this.drag = null;
      this.endHover();
    });
  }

  // ---------- dragging ----------

  /** where a drop at a client point would land; the dish says itself whether the point is inside it */
  targetAt(cx: number, cy: number): Target | null {
    const el = document.elementFromPoint(cx, cy)?.closest<HTMLElement>('[data-drop]');
    switch (el?.dataset.drop) {
      case 'dish':
        return { kind: 'dish', cx, cy };
      case 'drawer':
        return { kind: 'drawer' };
      case 'bench': {
        const b = el.getBoundingClientRect();
        return { kind: 'bench', cross: !!this.bench && cx > b.left + b.width / 2 };
      }
      default:
        return null;
    }
  }

  /** the ghost follows the pointer; the place it would land is marked (the bench shows replace | cross) */
  hover(sp: Species, cx: number, cy: number, target = this.targetAt(cx, cy)): void {
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
    this.halves[0].classList.toggle('hot', target?.kind === 'bench' && !target.cross);
    this.halves[1].classList.toggle('hot', target?.kind === 'bench' && target.cross);
  }

  endHover(): void {
    this.dragged = null;
    this.ghost.classList.remove('on');
    this.overEl?.classList.remove(css.over);
    this.overEl = null;
    this.benchBox.classList.remove('target');
  }

  /** a specimen dropped on the drawer or the bench; true when it left where it came from (a cell leaves the dish) */
  land(sp: Species, target: Target, from: Source): boolean {
    if (target.kind === 'drawer') {
      if (from === 'entry') return false;
      this.toast(t(this.specimens.add(sp) ? 'labSaved' : 'labHave'));
      this.render();
      return true;
    }
    if (target.kind !== 'bench' || from === 'bench') return false;
    if (!target.cross || !this.bench) {
      this.bench = sp;
      return true;
    }
    const h = hybridise(this.bench, sp, Math.random, (name) => this.host.taken(name));
    if (!h) {
      this.toast(t('labSame'));
      return false;
    }
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
    const d = dpr();
    for (const tile of this.tiles) this.paint(tile.canvas, tile.ctx, tile.entry.sp, 64, d);
    if (this.benchEl.offsetParent) this.paint(this.benchCanvas, this.benchCtx, this.bench, this.benchBox.clientWidth, d);
    if (this.dragged) this.paint(this.ghost, this.ghostCtx, this.dragged, 72, d);
  }

  private paint(cv: HTMLCanvasElement, g: CanvasRenderingContext2D, sp: Species | null, size: number, d: number): void {
    const n = Math.max(2, Math.round(size * d));
    if (cv.width !== n || cv.height !== n) cv.width = cv.height = n;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, n, n);
    if (sp) this.host.r.portrait(g, sp, n / 2, n / 2, n * 0.26, n * 0.42, this.time, d);
  }

  /** the names the drawer holds */
  names(): string[] {
    return this.specimens.entries.map((e) => e.sp.name);
  }
}
