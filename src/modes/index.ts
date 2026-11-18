// Every mode, in the order the header icon cycles through them. The first is the default.
import type { ModeDef } from './types';
import { keymash } from './keymash';
import { petri } from './petri';
import { cookie } from './cookie';
import { mycelium } from './mycelium';

// A build ships only the modes in BUILD_MODES (vite.config.ts): the others' imports here resolve to
// null, so none of their code, styles or assets reach dist/. Dev and the scripts have every mode.
export const MODES: readonly ModeDef[] = [keymash, petri, cookie, mycelium].filter((m) => m !== null);

export function modeById(id: string): ModeDef {
  return MODES.find((m) => m.id === id) ?? MODES[0]!;
}

export function nextMode(m: ModeDef): ModeDef {
  return MODES[(MODES.indexOf(m) + 1) % MODES.length]!;
}
