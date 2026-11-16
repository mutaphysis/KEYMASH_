// MYCELIUM_: a photographic forest floor, seen from the side. What the shell needs up front; the code is in
// mode.ts (its own chunk).
import type { ModeDef } from '../types';
import { t } from './messages';
import { myceliumTheme, sprout } from './theme.css';

const ICON = `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="#d9c9a3" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <path fill="rgba(217,201,163,.18)" d="M14 30c0-10 8-17 18-17s18 7 18 17z"/><path d="M28 30v10M36 30v10"/>
  <path stroke="#9fb37a" d="M6 40h52"/>
  <path stroke-width="1.6" d="M32 40c0 6-6 7-10 12M32 40c1 6 7 8 9 14M30 46c-6 0-10 2-15 1M36 47c5-1 9 1 13-1"/></g></svg>`;

export const mycelium: ModeDef = {
  id: 'mycelium',
  name: 'MYCELIUM_',
  icon: ICON,
  tagline: t('tagline'),
  themeColor: '#0c0b08',
  theme: myceliumTheme,
  transition: sprout,
  load: () => import('./mode').then((m) => m.mode),
};
