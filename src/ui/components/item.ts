// <km-item>: a drawer row. An optional icon, a name, a smaller line underneath, an action; optionally a delete button.
import { iconEl } from '../icon';
import type { IconName } from '../icon';
import { row, name as nameCls, sub as subCls, del } from './drawer.css';

export interface ItemOpts {
  name: string;
  sub: string;
  onPick: () => void;
  onDelete?: () => void;
  /** in front of the name, e.g. the voice in use gets `check` */
  icon?: IconName;
}

export class KmItem extends HTMLElement {
  static create(o: ItemOpts): KmItem {
    const el = document.createElement('km-item');
    el.classList.add(row);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = nameCls;
    if (o.icon) b.append(iconEl(o.icon));
    b.append(o.name);
    const s = document.createElement('small');
    s.className = subCls;
    s.textContent = o.sub;
    b.appendChild(s);
    b.addEventListener('click', o.onPick);
    el.appendChild(b);
    if (o.onDelete) {
      const d = document.createElement('button');
      d.type = 'button';
      d.className = del;
      d.append(iconEl('close'));
      d.addEventListener('click', o.onDelete);
      el.appendChild(d);
    }
    return el;
  }
}
customElements.define('km-item', KmItem);
declare global {
  interface HTMLElementTagNameMap {
    'km-item': KmItem;
  }
}
