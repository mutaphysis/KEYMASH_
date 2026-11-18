// PETRI_'s lab: the dish without a text feeding it. The running culture carries over (or a fresh dish
// starts); by hand you add, carry, poke, inspect, kill, mutate and divide cells, feed and stream the water.
import { Petri } from '../culture';
import type { CultureEvent } from '../culture';
import type { MicroPlayer } from '../player';
import { MicroRenderer } from '../render';
import { Ambient } from '../ambient';
import { DISH_R } from '../sim';
import type { Cell, DishState, Food, World } from '../sim';
import { mutateGenome, specimen } from '../genome';
import type { Genome, Species } from '../genome';
import { t } from '../messages';
import { ON_CELL, TOOLS } from './tools';
import type { ToolId } from './tools';
import { Shelf } from './shelf';
import type { ShelfPick } from './shelf';
import { Viewer } from './viewer';
import type { ViewTarget } from './viewer';
import * as css from './lab.css';
import type { ViewContext } from '../../types';
import type { AudioEngine } from '../../../engine/audio';
import type { KmButton } from '../../../ui/components/button';
import type { KmToast } from '../../../ui/components/toast';
import { $ } from '../../../ui/dom';
import { iconCursor } from '../../../ui/icon';
import type { IconName } from '../../../ui/icon';
import { hash } from '../../../lang/rng';

/** the tools' cursors: white with a black outline, readable over the dark water and the bright cells alike */
const CURSOR = '#fff';
/** seconds between two food drops while the food tool is held down */
const FEED_EVERY = 0.12;
/** the hand: held this long (ms) or moved this far (CSS px), a press carries the cell instead of poking it */
const HOLD_MS = 250;
const HOLD_PX = 8;
/** how long clear can be undone (ms) */
const UNDO_MS = 6000;
/** auto feed: algae per second of dish time, for the dish and for each cell in it */
const FEED_BASE = 0.2;
const FEED_PER_CELL = 0.15;
/** it pauses while this much food lies about: a base and so many pieces per cell */
const FOOD_ENOUGH = [8, 4] as const;

/** a press of the hand on a cell: a poke when it ends soon and close by, else the cell is carried */
interface Press {
  cell: Cell;
  cx: number;
  cy: number;
  t0: number;
  carrying: boolean;
  /** the last point in the dish the carried cell was at */
  last: [number, number];
}

export class Lab {
  private audio: AudioEngine;
  private amb: Ambient;
  private root = document.createElement('div');
  private dishEl = document.createElement('div');
  private canvas = document.createElement('canvas');
  private toolsEl = document.createElement('div');
  private shelf: Shelf;
  private viewer: Viewer;
  private r: MicroRenderer;
  private petri: Petri | null = null;
  private ctx: ViewContext | null = null;
  private tool: ToolId = 'hand';
  private toolBtns = new Map<ToolId, KmButton>();
  private sweepBtn!: KmButton;
  private feedBtn!: KmButton;
  private pauseBtn!: KmButton;
  private fastBtn!: KmButton;
  private paused = false;
  private speed = 1;
  private raf = 0;
  private last = 0;
  private cursors = new Map<ToolId, string>();
  /** where a mouse hovers over the dish (world units); null when it is elsewhere or the pointer is a finger */
  private pointer: [number, number] | null = null;
  private press: Press | null = null;
  /** the pointer held down on the dish with the food tool: where, and how long until the next drop */
  private feeding: { x: number; y: number; next: number } | null = null;
  /** what clear took out of the dish, while it can be put back */
  private undo: DishState | null = null;
  /** on by default: algae drift in by themselves, more the more cells there are */
  private autoFeed = true;
  private feedAcc = 0;

  constructor(audio: AudioEngine) {
    this.audio = audio;
    this.amb = new Ambient(audio);
    this.r = new MicroRenderer(this.canvas);
    this.shelf = new Shelf({
      r: this.r,
      toDish: (sp, cx, cy) => this.toDish(sp, cx, cy),
      taken: (name) => this.taken(name),
      pick: (p) => this.inspect(p),
      split: () => !!this.ctx?.root.classList.contains('split'),
    });
    this.viewer = new Viewer({
      r: this.r,
      world: () => this.petri?.world ?? null,
      keep: (target, g) => this.keep(target, g),
    });
    this.loop = this.loop.bind(this);
  }

  /** the DOM, once: the first open() puts it into the app */
  private build(parent: HTMLElement): void {
    this.root.className = css.root;
    const top = document.createElement('div');
    top.className = css.top;
    const title = document.createElement('div');
    title.className = css.title;
    title.textContent = t('labTitle');
    const mute = document.createElement('km-mute');
    mute.setAttribute('variant', 'header');
    this.dishEl.className = css.dish;
    this.dishEl.dataset.drop = 'dish';
    this.canvas.className = css.canvas;
    this.dishEl.append(this.canvas);
    this.toolsEl.className = css.tools;
    this.toolsEl.setAttribute('role', 'toolbar');
    this.root.append(top, this.shelf.benchEl, this.dishEl, this.toolsEl, this.shelf.drawer, this.viewer.el, this.shelf.ghost);
    parent.append(this.root);
    // km-buttons build their <button> once connected: texts and titles go on after that
    const back = this.button(top, 'header', 'left', '', () => this.close());
    back.button.title = t('labBack');
    back.button.setAttribute('aria-label', t('labBack'));
    top.append(title, mute);

    for (const tool of TOOLS) {
      const b = this.button(this.toolsEl, 'tool', tool.icon, t(tool.label), () => this.pick(tool.id));
      this.toolBtns.set(tool.id, b);
    }
    const div = document.createElement('div');
    div.className = css.divider;
    this.toolsEl.append(div);
    this.feedBtn = this.button(this.toolsEl, 'tool', 'autoFeed', t('toolAutoFeed'), () => this.setAutoFeed(!this.autoFeed));
    this.sweepBtn = this.button(this.toolsEl, 'tool', 'sweep', t('toolClear'), () => this.sweep());
    this.pauseBtn = this.button(this.toolsEl, 'tool', 'pause', t('toolPause'), () => this.setPaused(!this.paused));
    this.fastBtn = this.button(this.toolsEl, 'tool', 'fast', t('toolFast'), () => this.setSpeed(this.speed === 1 ? 3 : 1));
    this.viewer.mount();

    new ResizeObserver(() => this.fit()).observe(this.dishEl);
    this.canvas.addEventListener('pointerdown', (e) => this.down(e));
    this.canvas.addEventListener('pointermove', (e) => this.move(e));
    this.canvas.addEventListener('pointerup', (e) => this.up(e));
    this.canvas.addEventListener('pointercancel', (e) => this.up(e, true));
    this.canvas.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && !e.buttons) this.pointer = null;
    });
  }

  private button(parent: HTMLElement, variant: 'header' | 'tool', icon: IconName, text: string, onClick: () => void): KmButton {
    const b = document.createElement('km-button');
    b.setAttribute('variant', variant);
    b.setAttribute('icon', icon);
    parent.append(b);
    b.text = text;
    b.addEventListener('click', onClick);
    return b;
  }

  /** `from`: the player whose culture was running, or null for a fresh dish */
  open(ctx: ViewContext, from: MicroPlayer | null): void {
    if (!this.root.isConnected) this.build(ctx.root);
    this.ctx = ctx;
    // the culture goes on without its text: no feeder, no reading
    this.petri = from?.petri ?? new Petri('', (Math.random() * 2 ** 31) | 0 || 1);
    this.petri.swap('');
    this.r.reset();
    this.pick('hand');
    this.setPaused(false);
    this.setSpeed(1);
    this.setAutoFeed(true);
    this.armUndo(null);
    this.amb.configure(hash(from?.src ?? 'lab'));
    this.audio.init();
    this.amb.start();
    this.root.classList.add('on');
    this.fit();
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
  }

  close(): void {
    this.viewer.close();
    this.letGo();
    this.feeding = null;
    this.pointer = null;
    this.armUndo(null);
    cancelAnimationFrame(this.raf);
    this.amb.stop();
    this.audio.stop();
    this.root.classList.remove('on');
    this.petri = null;
    const ctx = this.ctx;
    this.ctx = null;
    ctx?.close();
  }

  private fit(): void {
    const w = this.dishEl.clientWidth,
      h = this.dishEl.clientHeight;
    if (w > 1 && h > 1) this.r.resize(w, h);
  }

  private toast(text: string): void {
    $<KmToast>('toast').show(text);
  }

  // ---------- the toolbar ----------

  private pick(tool: ToolId): void {
    this.tool = tool;
    for (const [id, b] of this.toolBtns) b.toggleAttribute('active', id === tool);
    void this.cursorFor(tool);
  }

  /** the dish canvas shows the tool as its cursor; the hand uses the system's own (see hovering()) */
  private async cursorFor(tool: ToolId): Promise<void> {
    if (tool === 'hand') {
      this.canvas.style.cursor = 'default';
      return;
    }
    let c = this.cursors.get(tool);
    if (!c) {
      c = await iconCursor(TOOLS.find((d) => d.id === tool)!.icon, CURSOR);
      this.cursors.set(tool, c);
    }
    if (this.tool === tool) this.canvas.style.cursor = c;
  }

  private setPaused(on: boolean): void {
    this.paused = on;
    this.pauseBtn.icon = on ? 'play' : 'pause';
    this.pauseBtn.text = t(on ? 'toolPlay' : 'toolPause');
    this.pauseBtn.toggleAttribute('active', on);
  }

  private setSpeed(s: number): void {
    this.speed = s;
    this.fastBtn.toggleAttribute('active', s !== 1);
  }

  /** clear empties the dish; for a few seconds the button undoes it */
  private sweep(): void {
    const W = this.petri?.world;
    if (!W) return;
    if (this.undo) {
      W.restore(this.undo);
      this.armUndo(null);
      return;
    }
    this.letGo();
    this.r.hover = null;
    this.armUndo(W.clear());
    this.r.ripple(0, 0, 20, DISH_R, 1.2, 190, 0.35);
  }

  private armUndo(state: DishState | null): void {
    this.undo = state;
    this.sweepBtn.icon = state ? 'undo' : 'sweep';
    this.sweepBtn.text = t(state ? 'toolUndo' : 'toolClear');
    this.sweepBtn.countdown(state ? UNDO_MS : 0, () => this.armUndo(null));
  }

  // ---------- hands in the dish ----------

  /** a pointer position on the dish canvas in world units */
  private world(e: PointerEvent): [number, number] {
    const b = this.canvas.getBoundingClientRect();
    return this.r.toWorld(e.clientX - b.left, e.clientY - b.top);
  }

  /** how near (world units) a touch has to come to hit a cell: 10 CSS pixels */
  private slack(): number {
    return (10 * this.r.dpr) / this.r.k;
  }

  /** the reticle follows what the tool would act on; the hand's cursor says whether there is something to grab */
  private hovering(): void {
    const W = this.petri?.world;
    const p = this.pointer;
    let h: Cell | Food | null = null,
      dna = false;
    if (W && p && !this.press?.carrying && ON_CELL[this.tool]) {
      h = W.cellAt(p[0], p[1], this.slack());
      dna = this.tool === 'look' && !!h;
      if (!h && this.tool === 'look') {
        const f = W.foodAt(p[0], p[1], this.slack());
        if (f) {
          h = f;
          dna = !!f.sp;
        }
      }
    }
    this.r.hover = h;
    this.r.hoverDna = dna;
    if (this.tool === 'hand') this.canvas.style.cursor = this.press?.carrying ? 'grabbing' : h ? 'grab' : 'default';
  }

  private down(e: PointerEvent): void {
    const W = this.petri?.world;
    if (!W || this.press) return;
    const [x, y] = this.world(e);
    if (Math.hypot(x, y) > DISH_R) return;
    this.canvas.setPointerCapture(e.pointerId);
    this.audio.init();
    this.pointer = [x, y];
    this.hovering();
    const c = ON_CELL[this.tool] ? W.cellAt(x, y, this.slack()) : null;
    const live = c && (c.state === 'live' || c.state === 'dividing');
    switch (this.tool) {
      case 'hand':
        if (c?.state === 'live')
          this.press = { cell: c, cx: e.clientX, cy: e.clientY, t0: performance.now(), carrying: false, last: [c.x, c.y] };
        break;
      case 'kill':
        if (live) W.kill(c);
        break;
      case 'mutate':
        if (live) W.retype(c, specimen(mutateGenome(c.sp.genome, Math.random, 1 + Math.floor(Math.random() * 3))));
        break;
      case 'divide':
        if (c?.state === 'live') {
          if (W.forceDivide(c)) this.r.ripple(c.x, c.y, c.r, c.r * 2.4, 0.8, c.sp.hue, 0.4);
          else this.toast(t('labFull'));
        }
        break;
      case 'food':
        this.feeding = { x, y, next: 0 };
        this.feed();
        break;
      case 'stream':
        this.r.aim = { x0: x, y0: y, x1: x, y1: y };
        break;
      case 'toxin':
        W.addZone('toxin', x, y, { r: 95, dur: 12 });
        this.amb.touch(x);
        break;
      case 'look': {
        // a cell, or a piece of debris that still carries a genome: open its genes
        const f = c ? null : W.foodAt(x, y, this.slack());
        if (c) this.viewer.show({ kind: 'cell', cell: c }, c.sp);
        else if (f?.sp) this.viewer.show({ kind: 'debris', sp: f.sp }, f.sp);
        break;
      }
    }
    this.flush();
  }

  private move(e: PointerEvent): void {
    const [x, y] = this.world(e);
    if (e.pointerType === 'mouse' || e.buttons) this.pointer = [x, y];
    const p = this.press;
    if (p && !p.carrying && Math.hypot(e.clientX - p.cx, e.clientY - p.cy) >= HOLD_PX) this.carry();
    if (p?.carrying) this.carryTo(x, y, e);
    const a = this.r.aim;
    if (a) [a.x1, a.y1] = this.inDish(x, y);
    if (this.feeding && Math.hypot(x, y) <= DISH_R) [this.feeding.x, this.feeding.y] = [x, y];
  }

  private up(e: PointerEvent, cancelled = false): void {
    const W = this.petri?.world;
    const p = this.press;
    if (W && p && !cancelled) {
      if (p.carrying) this.dropCell(e);
      else {
        W.poke(p.cell);
        this.r.jiggle(p.cell);
        this.amb.touch(p.cell.x);
      }
    }
    this.letGo();
    const a = this.r.aim;
    if (W && a && !cancelled) {
      const len = Math.hypot(a.x1 - a.x0, a.y1 - a.y0);
      if (len < 12) W.addZone('current', a.x0, a.y0, { r: 150, dur: 8, swirl: 1 });
      else
        W.addZone('current', (a.x0 + a.x1) / 2, (a.y0 + a.y1) / 2, {
          r: Math.max(90, Math.min(260, len * 0.9)),
          dur: 8,
          angle: Math.atan2(a.y1 - a.y0, a.x1 - a.x0),
          strength: Math.max(0.4, Math.min(1.6, len / 150)),
        });
      this.amb.touch(a.x0);
    }
    this.r.aim = null;
    this.feeding = null;
    if (e.pointerType !== 'mouse') this.pointer = null;
    this.flush();
  }

  private inDish(x: number, y: number): [number, number] {
    const d = Math.hypot(x, y);
    return d > DISH_R ? [(x / d) * DISH_R, (y / d) * DISH_R] : [x, y];
  }

  /** the press becomes carrying: the cell stands still in the hand */
  private carry(): void {
    const p = this.press;
    if (!p) return;
    p.carrying = true;
    p.cell.held = true;
    this.r.held = p.cell;
    this.hovering();
  }

  /** in the dish the cell goes along; past its rim the cell stays behind and its ghost goes on (to the drawer, the bench) */
  private carryTo(x: number, y: number, e: PointerEvent): void {
    const p = this.press,
      W = this.petri?.world;
    if (!p || !W) return;
    this.r.heldOut = Math.hypot(x, y) > DISH_R;
    if (this.r.heldOut) {
      this.shelf.hover(p.cell.sp, e.clientX, e.clientY);
      return;
    }
    this.shelf.endHover();
    [p.cell.x, p.cell.y] = W.inside(x, y, p.cell.r);
    p.last = [p.cell.x, p.cell.y];
  }

  /** the carried cell let go: in the dish where it is; on the drawer or the bench it leaves the dish; anywhere else it goes back */
  private dropCell(e: PointerEvent): void {
    const p = this.press,
      W = this.petri?.world;
    if (!p || !W) return;
    if (this.r.heldOut) {
      const target = this.shelf.targetAt(e.clientX, e.clientY);
      if (target && target.kind !== 'dish' && this.shelf.land(p.cell.sp, target, 'cell')) W.remove(p.cell);
      else [p.cell.x, p.cell.y] = p.last;
    }
    this.drop();
  }

  /** set the carried cell down where it is: it starts afresh from standstill */
  private drop(): void {
    const c = this.press?.cell;
    if (!c) return;
    c.held = false;
    c.vx = c.vy = 0;
    c.think = 0;
  }

  /** a specimen from the shelf let go over the dish: a new cell, if it lands inside and there is room */
  private toDish(sp: Species, cx: number, cy: number): void {
    const W = this.petri?.world;
    if (!W) return;
    const b = this.canvas.getBoundingClientRect();
    const [x, y] = this.r.toWorld(cx - b.left, cy - b.top);
    if (Math.hypot(x, y) > DISH_R) return;
    const c = W.spawnCell(sp, x, y);
    if (!c) this.toast(t('labFull'));
    else this.route({ type: 'spawn', x: c.x, y: c.y, sp });
    this.flush();
  }

  /** a tile or the bench tapped: its genes */
  private inspect(p: ShelfPick): void {
    const sp = p.kind === 'entry' ? p.entry.sp : this.shelf.bench;
    if (sp) this.viewer.show(p, sp);
  }

  /** edited genes kept: the cell becomes them, the drawer keeps them (a built-in stays as it is), the bench holds them */
  private keep(target: ViewTarget, g: Genome): void {
    const sp = specimen(g);
    switch (target.kind) {
      case 'cell': {
        const c = target.cell;
        if (!c.gone && (c.state === 'live' || c.state === 'dividing')) this.petri?.world.retype(c, sp);
        this.flush();
        break;
      }
      case 'entry':
        if (target.entry.builtIn) this.toast(t(this.shelf.specimens.add(sp) ? 'labSaved' : 'labHave'));
        else this.shelf.specimens.replace(target.entry, sp);
        this.shelf.render();
        break;
      case 'bench':
        this.shelf.bench = sp;
        break;
      case 'debris':
        break;
    }
  }

  private taken(name: string): boolean {
    const W = this.petri?.world;
    return (!!W && [...W.seen].some((s) => s.name === name)) || this.shelf.names().includes(name);
  }

  /** end any press; a carried cell is let go where it is */
  private letGo(): void {
    if (this.press?.carrying) {
      this.drop();
      this.shelf.endHover();
    }
    this.press = null;
    this.r.held = null;
    this.r.heldOut = false;
    this.hovering();
  }

  /** drop food where the pointer is, as the play mode's tap does */
  private feed(): void {
    const f = this.feeding;
    if (!f || !this.petri) return;
    this.petri.world.addFood(f.x, f.y, 2, 'algae', 18);
    this.r.ripple(f.x, f.y, 4, 40, 1.4, 100, 0.5);
    this.amb.touch(f.x);
    f.next = FEED_EVERY;
    this.flush();
  }

  /** what the lab's hands made happen (outside a step): drawn and heard at once, even while paused */
  private flush(): void {
    if (this.petri) for (const ev of this.petri.world.events()) this.route(ev);
  }

  private route(ev: CultureEvent): void {
    if (ev.type === 'read' || ev.type === 'note') return;
    this.r.handle(ev);
    this.amb.event(ev);
  }

  private loop(now: number): void {
    const p = this.petri;
    if (!p) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const pr = this.press;
    if (pr && (pr.cell.gone || pr.cell.state !== 'live')) this.letGo();
    else if (pr && !pr.carrying && now - pr.t0 >= HOLD_MS) this.carry();
    if (this.feeding && (this.feeding.next -= dt) <= 0) this.feed();
    if (!this.paused && this.autoFeed) this.feedDish(p.world, dt * this.speed);
    this.flush();
    if (!this.paused) for (const ev of p.tick(dt * this.speed)) this.route(ev);
    this.hovering();
    this.amb.update(dt, p.world.crowd);
    this.audio.readLevel();
    // real time even while paused: the water, wobbles and ripples keep moving
    this.r.frame(dt, p.world, this.amb.activity);
    this.shelf.frame(dt);
    this.viewer.frame(dt);
  }

  private setAutoFeed(on: boolean): void {
    this.autoFeed = on;
    this.feedBtn.toggleAttribute('active', on);
  }

  /** auto feed: single algae at random spots, as many per second as the dish's cells need */
  private feedDish(W: World, dt: number): void {
    const n = W.cells.length;
    if (W.food.length >= FOOD_ENOUGH[0] + n * FOOD_ENOUGH[1]) return;
    this.feedAcc += dt * (FEED_BASE + n * FEED_PER_CELL);
    for (; this.feedAcc >= 1; this.feedAcc--) {
      const a = Math.random() * Math.PI * 2,
        d = Math.sqrt(Math.random()) * DISH_R * 0.85;
      W.addFood(Math.cos(a) * d, Math.sin(a) * d, 1, 'algae', 0);
    }
  }
}
