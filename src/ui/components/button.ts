// <km-button icon="▶" label="run" variant="control" primary>: the app's one button.
// `label` and `title-key` are message ids (shared UI messages); `.icon` / `.text` change them later.
// The host takes no space (display: contents), so the inner <button> sits in the parent's layout.
import { t } from '../../i18n';
import type { Msg } from '../../i18n';
import { host, variant } from './button.css';
import type { Variant } from './button.css';

export class KmButton extends HTMLElement {
  readonly button = document.createElement('button');
  private iconEl = document.createElement('i');
  private textEl = document.createElement('span');
  private countdownTimer: ReturnType<typeof setTimeout> | undefined;

  connectedCallback(): void {
    if (this.button.isConnected) return;
    this.classList.add(host);
    this.button.type = 'button';
    this.button.className = variant[(this.getAttribute('variant') as Variant | null) ?? 'control'];
    this.iconEl.textContent = this.getAttribute('icon') ?? '';
    const label = this.getAttribute('label');
    this.textEl.textContent = label ? t(label as Msg) : '';
    const title = this.getAttribute('title-key');
    if (title) { this.button.title = t(title as Msg); this.button.setAttribute('aria-label', this.button.title); }
    this.button.append(this.iconEl, this.textEl);
    this.appendChild(this.button);
  }

  set icon(s: string) { this.iconEl.textContent = s; }
  set text(s: string) { this.textEl.textContent = s; }

  /** a fill drains from right to left over `ms`, then calls `done`; 0 cancels */
  countdown(ms: number, done?: () => void): void {
    clearTimeout(this.countdownTimer);
    this.removeAttribute('counting');
    if (!ms) return;
    void this.button.offsetWidth; // restart the animation
    this.style.setProperty('--countdown', ms + 'ms');
    this.setAttribute('counting', '');
    this.countdownTimer = setTimeout(() => { this.removeAttribute('counting'); done?.(); }, ms);
  }
  get counting(): boolean { return this.hasAttribute('counting'); }
}
customElements.define('km-button', KmButton);
declare global { interface HTMLElementTagNameMap { 'km-button': KmButton } }
