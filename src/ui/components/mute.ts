// <km-mute variant="header">: sound on/off. Every instance shows the same state.
import type { AudioEngine } from '../../engine/audio';
import { KmButton } from './button';

const CHANGED = 'km-mute';

export class KmMute extends KmButton {
  /** set once by the app before the first click */
  static audio: AudioEngine | null = null;

  override connectedCallback(): void {
    if (this.button.isConnected) return;
    if (!this.hasAttribute('title-key')) this.setAttribute('title-key', 'soundToggle');
    super.connectedCallback();
    this.show();
    this.button.addEventListener('click', () => {
      const a = KmMute.audio;
      if (!a) return;
      a.init();
      a.setMuted(!a.muted);
      document.dispatchEvent(new Event(CHANGED));
    });
    document.addEventListener(CHANGED, () => this.show());
  }

  private show(): void {
    this.icon = KmMute.audio?.muted ? '🔇' : '🔊';
  }
}
customElements.define('km-mute', KmMute);
declare global {
  interface HTMLElementTagNameMap {
    'km-mute': KmMute;
  }
}
