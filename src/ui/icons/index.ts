// Written by `bun scripts/ui-icons.ts` (the list lives there): mingcute icons from Iconify, one URL each.
import age from './age.svg?url';
import armor from './armor.svg?url';
import autoFeed from './autoFeed.svg?url';
import autoFeedOff from './autoFeedOff.svg?url';
import body from './body.svg?url';
import bond from './bond.svg?url';
import breed from './breed.svg?url';
import check from './check.svg?url';
import close from './close.svg?url';
import colony from './colony.svg?url';
import cookie from './cookie.svg?url';
import copy from './copy.svg?url';
import diet from './diet.svg?url';
import divide from './divide.svg?url';
import down from './down.svg?url';
import edit from './edit.svg?url';
import enter from './enter.svg?url';
import fast from './fast.svg?url';
import fertility from './fertility.svg?url';
import flagella from './flagella.svg?url';
import food from './food.svg?url';
import fullscreen from './fullscreen.svg?url';
import fullscreenExit from './fullscreenExit.svg?url';
import globe from './globe.svg?url';
import glow from './glow.svg?url';
import grid from './grid.svg?url';
import hand from './hand.svg?url';
import hue from './hue.svg?url';
import hue2 from './hue2.svg?url';
import hunger from './hunger.svg?url';
import hunter from './hunter.svg?url';
import kill from './kill.svg?url';
import lab from './lab.svg?url';
import left from './left.svg?url';
import life from './life.svg?url';
import light from './light.svg?url';
import lobes from './lobes.svg?url';
import look from './look.svg?url';
import mutate from './mutate.svg?url';
import mutation from './mutation.svg?url';
import mute from './mute.svg?url';
import note from './note.svg?url';
import omni from './omni.svg?url';
import open from './open.svg?url';
import organelles from './organelles.svg?url';
import pause from './pause.svg?url';
import paw from './paw.svg?url';
import photo from './photo.svg?url';
import play from './play.svg?url';
import reload from './reload.svg?url';
import restart from './restart.svg?url';
import right from './right.svg?url';
import sat from './sat.svg?url';
import save from './save.svg?url';
import share from './share.svg?url';
import sheet from './sheet.svg?url';
import size from './size.svg?url';
import sound from './sound.svg?url';
import speed from './speed.svg?url';
import spores from './spores.svg?url';
import stop from './stop.svg?url';
import stream from './stream.svg?url';
import sweep from './sweep.svg?url';
import toxin from './toxin.svg?url';
import undo from './undo.svg?url';
import up from './up.svg?url';
import wobble from './wobble.svg?url';

export const ICONS = {
  age,
  armor,
  autoFeed,
  autoFeedOff,
  body,
  bond,
  breed,
  check,
  close,
  colony,
  cookie,
  copy,
  diet,
  divide,
  down,
  edit,
  enter,
  fast,
  fertility,
  flagella,
  food,
  fullscreen,
  fullscreenExit,
  globe,
  glow,
  grid,
  hand,
  hue,
  hue2,
  hunger,
  hunter,
  kill,
  lab,
  left,
  life,
  light,
  lobes,
  look,
  mutate,
  mutation,
  mute,
  note,
  omni,
  open,
  organelles,
  pause,
  paw,
  photo,
  play,
  reload,
  restart,
  right,
  sat,
  save,
  share,
  sheet,
  size,
  sound,
  speed,
  spores,
  stop,
  stream,
  sweep,
  toxin,
  undo,
  up,
  wobble,
};
export type IconName = keyof typeof ICONS;

/** the rows each icon's drawing covers: top and bottom, 0–1 of its box */
export const INK: Record<IconName, readonly [number, number]> = {
  age: [0.083, 0.917],
  armor: [0.086, 0.914],
  autoFeed: [0.102, 0.979],
  autoFeedOff: [0.102, 0.979],
  body: [0.083, 0.917],
  bond: [0.188, 0.828],
  breed: [0.125, 0.875],
  check: [0.195, 0.791],
  close: [0.173, 0.827],
  colony: [0.125, 0.833],
  cookie: [0.083, 0.917],
  copy: [0.083, 0.917],
  diet: [0.12, 0.81],
  divide: [0.066, 0.896],
  down: [0.327, 0.687],
  edit: [0.095, 0.865],
  enter: [0.146, 0.833],
  fast: [0.232, 0.768],
  fertility: [0.084, 0.917],
  flagella: [0.083, 0.917],
  food: [0.125, 0.916],
  fullscreen: [0.104, 0.896],
  fullscreenExit: [0.104, 0.896],
  globe: [0.083, 0.917],
  glow: [0.083, 0.917],
  grid: [0.125, 0.875],
  hand: [0.084, 0.917],
  hue: [0.083, 0.917],
  hue2: [0.11, 0.866],
  hunger: [0.25, 0.75],
  hunter: [0.084, 0.917],
  kill: [0.083, 0.875],
  lab: [0.083, 0.917],
  left: [0.202, 0.798],
  life: [0.104, 0.896],
  light: [0.083, 0.917],
  lobes: [0.121, 0.879],
  look: [0.083, 0.88],
  mutate: [0.104, 0.904],
  mutation: [0.098, 0.917],
  mute: [0.129, 0.871],
  note: [0.083, 0.917],
  omni: [0.208, 0.833],
  open: [0.125, 0.875],
  organelles: [0.125, 0.875],
  pause: [0.125, 0.875],
  paw: [0.125, 0.875],
  photo: [0.083, 0.917],
  play: [0.144, 0.855],
  reload: [0.062, 0.937],
  restart: [0.062, 0.937],
  right: [0.202, 0.798],
  sat: [0.083, 0.917],
  save: [0.125, 0.875],
  share: [0.079, 0.921],
  sheet: [0.083, 0.917],
  size: [0.125, 0.875],
  sound: [0.129, 0.871],
  speed: [0.083, 0.917],
  spores: [0.111, 0.917],
  stop: [0.167, 0.833],
  stream: [0.192, 0.808],
  sweep: [0.083, 0.935],
  toxin: [0.083, 0.917],
  undo: [0.229, 0.708],
  up: [0.313, 0.673],
  wobble: [0.104, 0.896],
};
