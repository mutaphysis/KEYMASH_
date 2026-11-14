// Every mode, in the order the header icon cycles through them. The first is the default.
import type { ModeDef } from './types';
import { keymash } from './keymash';
import { petri } from './petri';

export const MODES: readonly ModeDef[] = [keymash, petri];

export function modeById(id: string): ModeDef {
  return MODES.find((m) => m.id === id) ?? MODES[0]!;
}

export function nextMode(m: ModeDef): ModeDef {
  return MODES[(MODES.indexOf(m) + 1) % MODES.length]!;
}
