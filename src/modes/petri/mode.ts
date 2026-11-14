// PETRI_'s code, loaded on first use (index.ts has what the shell needs up front).
import type { ModeCode } from '../types';
import { readCulture } from './genome';
import { MicroPlayer } from './player';
import { Plankton } from './backdrop';
import { DEMOS } from './demos';
import { SHEET } from './sheet';
import { t, tn } from './messages';

const KEYS = [
  '🌿',
  '☀️',
  '💧',
  '🫧',
  '🍄',
  '🦠',
  '🍬',
  '❄️',
  '🔥',
  '☠️',
  '💞',
  '🧫',
  '.',
  '~',
  '*',
  '!',
  '&',
  '+',
  '#',
  '@',
  '(',
  ')',
  '-',
  '?',
  '"',
];

export const mode: ModeCode = {
  emptyToast: t('emptyToast'),
  typing: 'water',
  demos: DEMOS,
  keys: KEYS,
  sheet: SHEET,
  backdrop: () => new Plankton(),
  status(src) {
    const n = readCulture(src).species.length;
    return { ok: t('alive'), count: n, unit: tn('species', n) };
  },
  player: (audio) => new MicroPlayer(audio),
};
