// COOKIE_'s code, loaded on first use (index.ts has what the shell needs up front).
import type { ModeCode } from '../types';
import { readRecipe } from './recipe';
import { CookiePlayer } from './player';
import { Flour } from './backdrop';
import { DEMOS } from './demos';
import { SHEET } from './sheet';
import { t, tn } from './messages';

const KEYS = [
  '🍪',
  '⭐',
  '❤️',
  '🎄',
  '🐻',
  '🔔',
  '🍫',
  '🍯',
  '✨',
  '👀',
  '🍒',
  '🔥',
  '❄️',
  '.',
  '!',
  '*',
  '+',
  '-',
  '°',
  '=',
  '~',
  '@',
  '%',
  '#',
  ':',
  ')',
  '[',
  ']',
  '"',
];

export const mode: ModeCode = {
  emptyToast: t('emptyToast'),
  typing: 'lounge',
  demos: DEMOS,
  keys: KEYS,
  sheet: SHEET,
  backdrop: () => new Flour(),
  status(src) {
    const n = readRecipe(src).count;
    return { ok: t('ready'), count: n, unit: tn('cookies', n) };
  },
  player: (audio) => new CookiePlayer(audio),
};
