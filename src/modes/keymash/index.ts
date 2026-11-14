// KEYMASH_: every keystroke compiles. What the shell needs up front; the code is in mode.ts
// (its own chunk). The interpreter is vm.ts, its events types.ts.
import type { ModeDef } from '../types';
import { t } from './messages';
import { keymashTheme, glitch } from './theme.css';

const ICON = `<svg class="ic-key" viewBox="0 0 64 64" aria-hidden="true"><g fill="rgba(57,255,122,.18)" stroke="#39ff7a" stroke-width="3">
  <rect x="6" y="20" width="12" height="15" rx="4" transform="rotate(-22 12 27)"/><rect x="19" y="8" width="12" height="15" rx="4" transform="rotate(-8 25 15)"/>
  <rect x="33" y="8" width="12" height="15" rx="4" transform="rotate(8 39 15)"/><rect x="46" y="20" width="12" height="15" rx="4" transform="rotate(22 52 27)"/>
  <path d="M32 31c10 0 19 9 20 18 1 8-6 11-12 9-4-1-6-2-8-2s-4 1-8 2c-6 2-13-1-12-9 1-9 10-18 20-18z"/></g></svg>`;

export const keymash: ModeDef = {
  id: 'keymash',
  name: 'KEYMASH_',
  glyph: '🐾',
  icon: ICON,
  tagline: t('tagline'),
  themeColor: '#000800',
  theme: keymashTheme,
  transition: glitch,
  load: () => import('./mode').then((m) => m.mode),
};
