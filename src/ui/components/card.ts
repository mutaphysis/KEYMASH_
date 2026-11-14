// <km-card>: one cheat-sheet card — the picture, the snippet, its name. A tap hands the snippet to onPick.
// grid() lays them out, intro() is the sentence above them. The pictures come from `bun scripts/sheet.ts`.
import type { SheetCard } from '../../modes/types';
import { host, card, grid, intro } from './card.css';

export class KmCard extends HTMLElement {
  static create(c: SheetCard, onPick: (code: string) => void): KmCard {
    const el = document.createElement('km-card');
    el.classList.add(host);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = card;
    if (c.img) {
      const img = document.createElement('img');
      img.src = c.img;
      img.alt = ''; // the snippet and the name below say what it shows
      img.loading = 'lazy';
      b.appendChild(img);
    }
    const code = document.createElement('code');
    code.textContent = c.code;
    const name = document.createElement('span');
    name.textContent = c.name;
    b.append(code, name);
    b.addEventListener('click', () => onPick(c.code));
    el.appendChild(b);
    return el;
  }
  static grid(cards: SheetCard[], onPick: (code: string) => void): HTMLElement {
    const d = document.createElement('div');
    d.className = grid;
    d.append(...cards.map((c) => KmCard.create(c, onPick)));
    return d;
  }
  static intro(text: string): HTMLElement {
    const p = document.createElement('p');
    p.className = intro;
    p.textContent = text;
    return p;
  }
}
customElements.define('km-card', KmCard);
declare global {
  interface HTMLElementTagNameMap {
    'km-card': KmCard;
  }
}
