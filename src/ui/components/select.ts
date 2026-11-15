// <km-select>: a native select (the phone's own picker) dressed like the drawer rows.
// Options are plain text (an <option> can't show an icon); the icon sits on the select instead.
import { iconEl } from '../icon';
import { pick, select, lead, arrow } from './drawer.css';

export interface SelectOpts<T extends string> {
  label: string;
  options: readonly (readonly [value: T, text: string])[];
  value: T;
  onPick: (v: T) => void;
  /** on the left, what the select is about: an iconEl() or the mode's own SVG */
  icon?: HTMLElement;
}

export class KmSelect extends HTMLElement {
  static create<T extends string>(o: SelectOpts<T>): KmSelect {
    const el = document.createElement('km-select');
    el.classList.add(pick);
    const sel = document.createElement('select');
    sel.className = select;
    sel.title = o.label;
    sel.setAttribute('aria-label', o.label);
    for (const [v, text] of o.options) {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = text;
      opt.selected = v === o.value;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => o.onPick(sel.value as T));
    if (o.icon) {
      o.icon.classList.add(lead);
      el.appendChild(o.icon);
    }
    const down = iconEl('down');
    down.classList.add(arrow);
    el.append(sel, down);
    return el;
  }
}
customElements.define('km-select', KmSelect);
declare global {
  interface HTMLElementTagNameMap {
    'km-select': KmSelect;
  }
}
