// The lab's tools: one cursor tool is active at a time; the instant buttons (clear, pause, 3×) sit after them.
import type { IconName } from '../../../ui/icon';
import type { PetriMsg } from '../messages';

export type ToolId = 'hand' | 'look' | 'kill' | 'mutate' | 'divide' | 'food' | 'stream' | 'toxin';
export interface ToolDef {
  id: ToolId;
  icon: IconName;
  label: PetriMsg;
}

export const TOOLS: readonly ToolDef[] = [
  { id: 'hand', icon: 'hand', label: 'toolHand' },
  { id: 'look', icon: 'look', label: 'toolLook' },
  { id: 'kill', icon: 'kill', label: 'toolKill' },
  { id: 'mutate', icon: 'mutate', label: 'toolMutate' },
  { id: 'divide', icon: 'divide', label: 'toolDivide' },
  { id: 'food', icon: 'food', label: 'toolFood' },
  { id: 'stream', icon: 'stream', label: 'toolStream' },
  { id: 'toxin', icon: 'toxin', label: 'toolToxin' },
];

/** tools that work on one cell: they show the reticle on the cell under the pointer */
export const ON_CELL: Partial<Record<ToolId, true>> = { hand: true, look: true, kill: true, mutate: true, divide: true };
