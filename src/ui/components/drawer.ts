// <km-drawer title-key="programs">: a sheet from the bottom over a dark backdrop.
// open(nodes) fills and shows it; a tap on the backdrop or ✖ closes it.
// heading(), empty() and split() build the pieces that go between the rows.
import { t } from '../../i18n';
import type { Msg } from '../../i18n';
import './button'; // the close button is a <km-button>
import { overlay, panel, head, heading, empty, split } from './drawer.css';

export class KmDrawer extends HTMLElement {
  private body = document.createElement('div');

  connectedCallback(): void {
    if (this.body.isConnected) return;
    this.classList.add(overlay);
    this.hidden = true;
    const p = document.createElement('div');
    p.className = panel;
    const h = document.createElement('div');
    h.className = head;
    const title = document.createElement('span');
    title.textContent = t((this.getAttribute('title-key') ?? 'programs') as Msg);
    const close = document.createElement('km-button');
    close.setAttribute('variant', 'row');
    close.setAttribute('icon', '✖');
    close.addEventListener('click', () => this.close());
    h.append(title, close);
    p.append(h, this.body);
    this.appendChild(p);
    this.addEventListener('click', (e) => {
      if (e.target === this) this.close();
    });
  }

  open(nodes: Node[]): void {
    const top = this.hidden ? 0 : this.body.parentElement!.scrollTop; // a refresh keeps the scroll position
    this.body.replaceChildren(...nodes);
    this.hidden = false;
    this.body.parentElement!.scrollTop = top;
  }
  close(): void {
    this.hidden = true;
  }

  static heading(text: string): HTMLElement {
    const h = document.createElement('h4');
    h.className = heading;
    h.textContent = text;
    return h;
  }
  static empty(text: string): HTMLElement {
    const d = document.createElement('div');
    d.className = empty;
    d.textContent = text;
    return d;
  }
  /** two things side by side */
  static split(...nodes: HTMLElement[]): HTMLElement {
    const d = document.createElement('div');
    d.className = split;
    d.append(...nodes);
    return d;
  }
}
customElements.define('km-drawer', KmDrawer);
declare global {
  interface HTMLElementTagNameMap {
    'km-drawer': KmDrawer;
  }
}
