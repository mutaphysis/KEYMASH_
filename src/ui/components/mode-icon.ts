// <km-mode-icon>: the current mode's icon in the header; a tap asks for the next mode ('next' event).
import { t } from '../../i18n';
import type { ModeDef } from '../../modes/types';
import { icon } from './mode-icon.css';

export class KmModeIcon extends HTMLElement {
  readonly button = document.createElement('button');

  connectedCallback(): void {
    if (this.button.isConnected) return;
    this.style.display = 'contents';
    this.button.type = 'button';
    this.button.className = icon;
    this.button.title = t('modeTitle');
    this.button.setAttribute('aria-label', t('modeAria'));
    this.button.addEventListener('click', () => this.dispatchEvent(new Event('next')));
    this.appendChild(this.button);
  }

  set mode(m: ModeDef) {
    this.button.innerHTML = m.icon;
  }
}
customElements.define('km-mode-icon', KmModeIcon);
declare global {
  interface HTMLElementTagNameMap {
    'km-mode-icon': KmModeIcon;
  }
}
