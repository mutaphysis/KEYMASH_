// PETRI_'s code, loaded on first use (index.ts has what the shell needs up front).
import type { ModeCode } from '../types';
import { readCulture } from './genome';
import { MicroPlayer } from './player';
import { Plankton } from './backdrop';
import { DEMOS } from './demos';
import { SHEET } from './sheet';
import { Lab, labWasOpen } from './lab/lab';
import { t, tn } from './messages';

/** the play mode's player: the lab takes over its culture when it opens while one runs */
let micro: MicroPlayer | null = null;
let lab: Lab | null = null;

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
  runHint: t('runHint'),
  typing: 'water',
  demos: DEMOS,
  keys: KEYS,
  sheet: SHEET,
  backdrop: () => new Plankton(),
  status(src) {
    const n = readCulture(src).species.length;
    return { ok: t('alive'), count: n, unit: tn('species', n) };
  },
  player: (audio) => (micro = new MicroPlayer(audio)),
  view: {
    icon: 'lab',
    title: t('labOpen'),
    open: (ctx) => (lab ??= new Lab(ctx.audio)).open(ctx, ctx.wasPlaying ? micro : null),
    reopen: labWasOpen,
  },
};
