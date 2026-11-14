// <km-item>: a drawer row. A name, a smaller line underneath, an action; optionally a delete button.
import { row, name as nameCls, sub as subCls, del } from './drawer.css';

export interface ItemOpts { name: string; sub: string; onPick: () => void; onDelete?: () => void }

export class KmItem extends HTMLElement {
  static create(o: ItemOpts): KmItem {
    const el = document.createElement('km-item');
    el.classList.add(row);
    const b = document.createElement('button'); b.type = 'button'; b.className = nameCls; b.textContent = o.name;
    const s = document.createElement('small'); s.className = subCls; s.textContent = o.sub; b.appendChild(s);
    b.addEventListener('click', o.onPick); el.appendChild(b);
    if (o.onDelete) {
      const d = document.createElement('button'); d.type = 'button'; d.className = del; d.textContent = '✖';
      d.addEventListener('click', o.onDelete); el.appendChild(d);
    }
    return el;
  }
}
customElements.define('km-item', KmItem);
declare global { interface HTMLElementTagNameMap { 'km-item': KmItem } }
