// MYCELIUM_'s code, loaded on first use (index.ts has what the shell needs up front).
import type { ModeCode } from '../types';
import { fetchAssets } from './assets';
import { ForestPlayer } from './player';
import { Spores } from './backdrop';
import { DEMOS } from './demos';
import { SHEET } from './sheet';
import { t, tn } from './messages';

// the mode was picked: the pictures download while the user types (a failure is retried at RUN)
fetchAssets().catch(() => {});

export const mode: ModeCode = {
  emptyToast: t('emptyToast'),
  runHint: t('runHint'),
  typing: 'lounge',
  demos: DEMOS,
  keys: [],
  sheet: SHEET,
  backdrop: () => new Spores(),
  status(src) {
    const n = src.split('\n').filter((l) => l.trim()).length;
    return { ok: t('ready'), count: n, unit: tn('lines', n) };
  },
  player: (audio, host) => new ForestPlayer(audio, host),
};
