// COOKIE_: the text is a recipe, RUN bakes it. What the shell needs up front; the code is in
// mode.ts (its own chunk).
import type { ModeDef } from '../types';
import { t } from './messages';
import { cookieTheme, warm } from './theme.css';

const ICON = `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="#ffd6a5" stroke-width="2.5" stroke-linejoin="round">
  <path fill="rgba(255,214,165,.16)" d="M34 7a25 25 0 1 0 23 23c-4 1-8-1-9-5-4 1-9-1-10-6-3-2-5-7-4-12z"/>
  <circle cx="24" cy="24" r="3" fill="#ffd6a5" stroke="none"/><circle cx="20" cy="40" r="2.6" fill="#ffd6a5" stroke="none"/>
  <circle cx="36" cy="44" r="3" fill="#ffd6a5" stroke="none"/><circle cx="35" cy="31" r="2.2" fill="#ffd6a5" stroke="none"/></g></svg>`;

export const cookie: ModeDef = {
  id: 'cookie',
  name: 'COOKIE_',
  glyph: '🍪',
  icon: ICON,
  tagline: t('tagline'),
  themeColor: '#140c08',
  theme: cookieTheme,
  transition: warm,
  load: () => import('./mode').then((m) => m.mode),
};
