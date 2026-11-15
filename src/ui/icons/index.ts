// Written by `bun scripts/ui-icons.ts` (the list lives there): mingcute icons from Iconify, one URL each.
import check from './check.svg?url';
import close from './close.svg?url';
import cookie from './cookie.svg?url';
import copy from './copy.svg?url';
import down from './down.svg?url';
import edit from './edit.svg?url';
import enter from './enter.svg?url';
import fullscreen from './fullscreen.svg?url';
import fullscreenExit from './fullscreenExit.svg?url';
import globe from './globe.svg?url';
import left from './left.svg?url';
import mute from './mute.svg?url';
import open from './open.svg?url';
import paw from './paw.svg?url';
import play from './play.svg?url';
import reload from './reload.svg?url';
import restart from './restart.svg?url';
import right from './right.svg?url';
import save from './save.svg?url';
import share from './share.svg?url';
import sheet from './sheet.svg?url';
import sound from './sound.svg?url';
import stop from './stop.svg?url';
import undo from './undo.svg?url';
import up from './up.svg?url';

export const ICONS = {
  check,
  close,
  cookie,
  copy,
  down,
  edit,
  enter,
  fullscreen,
  fullscreenExit,
  globe,
  left,
  mute,
  open,
  paw,
  play,
  reload,
  restart,
  right,
  save,
  share,
  sheet,
  sound,
  stop,
  undo,
  up,
};
export type IconName = keyof typeof ICONS;
