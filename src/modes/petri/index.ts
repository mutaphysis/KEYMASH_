// PETRI_: a quiet culture of cells. What the shell needs up front; the code is in mode.ts
// (its own chunk). Every line is a genome and a feeder.
import type { ModeDef } from '../types';
import { t } from './messages';
import { petriTheme, focus } from './theme.css';

const ICON = `<svg class="ic-cell" viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="#8ff5dc" stroke-width="2.5">
  <path fill="rgba(143,245,220,.14)" d="M32 6c13 0 25 9 25 24 0 16-11 28-26 28S7 47 7 32 19 6 32 6z"/>
  <circle cx="27" cy="31" r="8" fill="rgba(200,160,255,.35)" stroke="#d2b8ff"/><circle cx="29" cy="29" r="2" fill="#efe2ff" stroke="none"/>
  <circle cx="44" cy="22" r="2.5" fill="#8ff5dc" stroke="none"/><circle cx="42" cy="42" r="2" fill="#8ff5dc" stroke="none"/><circle cx="18" cy="45" r="1.8" fill="#8ff5dc" stroke="none"/></g></svg>`;

export const petri: ModeDef = {
  id: 'petri',
  name: 'PETRI_',
  glyph: '🧫',
  icon: ICON,
  tagline: t('tagline'),
  themeColor: '#010a0d',
  theme: petriTheme,
  transition: focus,
  load: () => import('./mode').then((m) => m.mode),
};
