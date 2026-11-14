// Runs in the browser (scripts/sheet/index.html, driven by scripts/sheet.ts): plays every cheat-sheet
// snippet through the real VM / culture and renderer, off screen and in simulated time, and returns
// the last frame of each as WebP. Math.random is seeded per card, so the pictures stay the same.
import '../../src/fonts.css';
import { MODES } from '../../src/modes';
import type { SheetCard } from '../../src/modes/types';
import { VM } from '../../src/modes/keymash/vm';
import { isSound } from '../../src/modes/keymash/types';
import type { VMEvent } from '../../src/modes/keymash/types';
import { Renderer } from '../../src/modes/keymash/render';
import { Petri } from '../../src/modes/petri/culture';
import { MicroRenderer } from '../../src/modes/petri/render';
import type { Cell } from '../../src/modes/petri/sim';
import { DISH_R } from '../../src/modes/petri/sim';
import { hash, mulberry32 } from '../../src/lang/rng';

/** CSS pixels; the renderers draw at devicePixelRatio (capped at 1.5) */
const W = 320,
  H = 200;
const FPS = 60;
/** events for the code view, the log and speech: not part of the picture */
const UI: Record<string, true> = { hl: true, log: true, gen: true, die: true, say: true };

function keymash(card: SheetCard, cv: HTMLCanvasElement): void {
  const r = new Renderer(cv);
  r.gentle = false;
  r.resize(W, H);
  // a smaller world on the same canvas: everything is drawn bigger, the VM spreads the keys over less
  r.s *= card.zoom;
  r.hw /= card.zoom;
  r.hh /= card.zoom;
  const vm = new VM(card.code, { hw: r.hw, hh: r.hh });
  const queue: { when: number; e: VMEvent }[] = [];
  let next = 0.05;
  for (let now = 0; now < card.at; now += 1 / FPS) {
    // the player's loop, minus sound: tick ahead, replay the visual events on time
    while (next < now + 0.12) {
      const d = vm.tickDur;
      for (const e of vm.tick()) if (!isSound(e) && !UI[e.type]) queue.push({ when: next + (e.dt || 0) * d + (e.at || 0), e });
      next += d;
    }
    for (let i = 0; i < queue.length;)
      if (queue[i]!.when <= now) r.handle(queue.splice(i, 1)[0]!.e);
      else i++;
    r.frame(1 / FPS, 0.3, 0.2);
  }
}

function petri(card: SheetCard, cv: HTMLCanvasElement): void {
  const r = new MicroRenderer(cv);
  r.gentle = false;
  r.resize(W, H);
  const R0 = r.R,
    zoom = card.zoom;
  const p = new Petri(card.code);
  let cell: Cell | undefined;
  let cx = 0,
    cy = 0;
  for (let now = 0; now < card.at; now += 1 / FPS) {
    for (const ev of p.tick(1 / FPS)) {
      if (ev.type === 'note') r.note(ev.note);
      else if (ev.type !== 'read') r.handle(ev);
    }
    if (zoom > 1) {
      // the camera follows the first cell, the dish rim leaves the picture
      if (!cell || cell.gone || cell.state === 'eaten') {
        cell = p.world.cells.find((c) => c.state === 'live');
        if (cell) [cx, cy] = [cell.x, cell.y];
      }
      if (cell) {
        cx += (cell.x - cx) * 0.08;
        cy += (cell.y - cy) * 0.08;
      }
      r.R = R0 * zoom;
      r.k = r.R / DISH_R;
      r.cx = r.W / 2 - cx * r.k;
      r.cy = r.H / 2 - cy * r.k;
    }
    r.captions = []; // the species' name card would cover the cell
    r.frame(1 / FPS, p.world, 0.5);
  }
}

const SHOOT: Record<string, (card: SheetCard, cv: HTMLCanvasElement) => void> = { keymash, petri };

export interface Shot {
  mode: string;
  id: string;
  code: string;
  name: string;
  webp: string;
}

async function shots(): Promise<Shot[]> {
  await document.fonts.ready;
  const out: Shot[] = [];
  for (const m of MODES) {
    for (const card of (await m.load()).sheet.cards) {
      Math.random = mulberry32(hash(m.id + ':' + card.id));
      const cv = document.createElement('canvas');
      document.body.replaceChildren(cv); // in the document, so fonts and emoji resolve like in the app
      SHOOT[m.id]!(card, cv);
      out.push({ mode: m.id, id: card.id, code: card.code, name: card.name, webp: cv.toDataURL('image/webp', 0.82) });
    }
  }
  return out;
}

declare global {
  interface Window {
    shots: typeof shots;
  }
}
window.shots = shots;
