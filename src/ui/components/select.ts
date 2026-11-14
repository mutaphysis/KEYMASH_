// <km-select>: a native select (the phone's own picker) dressed like the drawer rows.
import { pick, select } from './drawer.css';

export interface SelectOpts<T extends string> {
  label: string;
  options: readonly (readonly [value: T, text: string])[];
  value: T;
  onPick: (v: T) => void;
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
    el.appendChild(sel);
    return el;
  }
}
customElements.define('km-select', KmSelect);
declare global {
  interface HTMLElementTagNameMap {
    'km-select': KmSelect;
  }
}
