// <km-toast>: a short message under the header that goes away by itself, optionally ending in an icon.
import { iconEl } from '../icon';
import type { IconName } from '../icon';
import { toast } from './drawer.css';

export class KmToast extends HTMLElement {
  private timer: ReturnType<typeof setTimeout> | undefined;

  connectedCallback(): void {
    this.classList.add(toast);
    this.hidden = true;
    this.setAttribute('role', 'status');
  }

  show(text: string, icon?: IconName, ms = 1800): void {
    this.textContent = text;
    if (icon) this.append(' ', iconEl(icon));
    this.hidden = false;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.hidden = true;
    }, ms);
  }
}
customElements.define('km-toast', KmToast);
declare global {
  interface HTMLElementTagNameMap {
    'km-toast': KmToast;
  }
}
