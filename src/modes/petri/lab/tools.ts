// The lab's tools: one cursor tool is active at a time; the buttons that act at once (auto feed, clear, time) sit at the end.
import type { IconName } from '../../../ui/icon';
import type { PetriMsg } from '../messages';

export type ToolId = 'hand' | 'look' | 'kill' | 'mutate' | 'divide' | 'food' | 'stream' | 'light' | 'toxin';
export interface ToolDef {
  id: ToolId;
  icon: IconName;
  label: PetriMsg;
}

export const TOOLS: readonly ToolDef[] = [
  { id: 'hand', icon: 'hand', label: 'toolHand' },
  { id: 'look', icon: 'look', label: 'toolLook' },
  { id: 'mutate', icon: 'mutate', label: 'toolMutate' },
  { id: 'divide', icon: 'divide', label: 'toolDivide' },
  { id: 'food', icon: 'food', label: 'toolFood' },
  { id: 'stream', icon: 'stream', label: 'toolStream' },
  { id: 'light', icon: 'light', label: 'toolLight' },
  { id: 'toxin', icon: 'toxin', label: 'toolToxin' },
  { id: 'kill', icon: 'kill', label: 'toolKill' },
];

/** tools that work on one cell: they show the reticle on the cell under the pointer */
export const ON_CELL: Partial<Record<ToolId, true>> = { hand: true, look: true, kill: true, mutate: true, divide: true };

/** the time button steps through these, one per tap; it shows the one running. speed: dish seconds per second, 0 stops */
export const SPEEDS: readonly { speed: number; icon: IconName; label: PetriMsg }[] = [
  { speed: 1, icon: 'play', label: 'toolNormal' },
  { speed: 3, icon: 'fast', label: 'toolFast' },
  { speed: 0, icon: 'pause', label: 'toolPause' },
];
