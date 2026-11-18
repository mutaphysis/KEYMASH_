// PETRI_'s lab: the dish without a text feeding it. The running culture carries over (or a fresh dish
// starts); by hand you add, carry, poke, inspect, kill, mutate and divide cells, feed and stream the water.
import { Petri } from '../culture';
import type { CultureEvent } from '../culture';
import type { MicroPlayer } from '../player';
import { MicroRenderer } from '../render';
import { Ambient } from '../ambient';
import { DISH_R } from '../sim';
import { t } from '../messages';
import { TOOLS } from './tools';
import type { ToolId } from './tools';
import * as css from './lab.css';
import type { ViewContext } from '../../types';
import type { AudioEngine } from '../../../engine/audio';
import type { KmButton } from '../../../ui/components/button';
import { iconCursor } from '../../../ui/icon';
import type { IconName } from '../../../ui/icon';
import { hash } from '../../../lang/rng';

/** the cursor colour of the tools (the theme's fg) */
const CURSOR = '#8ff5dc';
/** seconds between two food drops while the food tool is held down */
const FEED_EVERY = 0.12;

export class Lab {
  private audio: AudioEngine;
  private amb: Ambient;
  private root = document.createElement('div');
  private dishEl = document.createElement('div');
  private canvas = document.createElement('canvas');
  private toolsEl = document.createElement('div');
  private drawerEl = document.createElement('div');
  private r: MicroRenderer;
  private petri: Petri | null = null;
  private ctx: ViewContext | null = null;
  private tool: ToolId = 'hand';
  private toolBtns = new Map<ToolId, KmButton>();
  private pauseBtn!: KmButton;
  private fastBtn!: KmButton;
  private paused = false;
  private speed = 1;
  private raf = 0;
  private last = 0;
  private cursors = new Map<ToolId, string>();
  /** the pointer held down on the dish with the food tool: where, and how long until the next drop */
  private feeding: { x: number; y: number; next: number } | null = null;

  constructor(audio: AudioEngine) {
    this.audio = audio;
    this.amb = new Ambient(audio);
    this.r = new MicroRenderer(this.canvas);
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
    this.drawerEl.className = css.drawer;
    this.drawerEl.dataset.drop = 'drawer';
    this.root.append(top, this.dishEl, this.toolsEl, this.drawerEl);
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
    this.pauseBtn = this.button(this.toolsEl, 'tool', 'pause', t('toolPause'), () => this.setPaused(!this.paused));
    this.fastBtn = this.button(this.toolsEl, 'tool', 'fast', t('toolFast'), () => this.setSpeed(this.speed === 1 ? 3 : 1));

    new ResizeObserver(() => this.fit()).observe(this.dishEl);
    this.canvas.addEventListener('pointerdown', (e) => this.down(e));
    this.canvas.addEventListener('pointermove', (e) => this.move(e));
    this.canvas.addEventListener('pointerup', (e) => this.up(e));
    this.canvas.addEventListener('pointercancel', (e) => this.up(e));
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
    this.feeding = null;
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

  private pick(tool: ToolId): void {
    this.tool = tool;
    for (const [id, b] of this.toolBtns) b.toggleAttribute('active', id === tool);
    void this.cursorFor(tool);
  }

  /** the dish canvas shows the tool as its cursor; the hand uses the system's own */
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

  /** a pointer position on the dish canvas in world units */
  private world(e: PointerEvent): [number, number] {
    const b = this.canvas.getBoundingClientRect();
    return this.r.toWorld(e.clientX - b.left, e.clientY - b.top);
  }

  private down(e: PointerEvent): void {
    if (!this.petri) return;
    const [x, y] = this.world(e);
    if (Math.hypot(x, y) > DISH_R) return;
    this.canvas.setPointerCapture(e.pointerId);
    this.audio.init();
    if (this.tool === 'food') {
      this.feeding = { x, y, next: 0 };
      this.feed();
    }
  }

  private move(e: PointerEvent): void {
    if (!this.feeding) return;
    const [x, y] = this.world(e);
    if (Math.hypot(x, y) > DISH_R) return;
    this.feeding.x = x;
    this.feeding.y = y;
  }

  private up(_e: PointerEvent): void {
    this.feeding = null;
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
    if (this.feeding && (this.feeding.next -= dt) <= 0) this.feed();
    this.flush();
    if (!this.paused) for (const ev of p.tick(dt * this.speed)) this.route(ev);
    this.amb.update(dt, p.world.crowd);
    this.audio.readLevel();
    // real time even while paused: the water, wobbles and ripples keep moving
    this.r.frame(dt, p.world, this.amb.activity);
  }
}
