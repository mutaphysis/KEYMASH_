// What a mode is. Every mode lives in src/modes/<id>/ and exports one ModeDef;
// src/modes/index.ts lists them. The app shell (main.ts, the drawer, the editor, storage)
// reads everything mode specific from here.
import type { AudioEngine, TypingStyle } from '../engine/audio';
import type { Demo } from '../ui/storage';
import type { IconName } from '../ui/icon';

/**
 * Play mode: owns the shared stage (#stage, #hud, #log, #boot, #codeview) between start() and stop().
 * A player that cannot draw on #stage (it has a 2D context) may add its own canvas to #stageWrap,
 * and must hide it in stop().
 */
export interface ModePlayer {
  start(src: string): void | Promise<void>;
  /** silent: keep the sound running (another start follows at once) */
  stop(silent?: boolean): void;
  restart(): void;
  /** live coding: take the edited text without stopping */
  hotSwap(src: string): void;
  /** the stage changed size */
  fit(): void;
}

/** what a player may ask of the app shell */
export interface PlayerHost {
  /** stop and go back to the editor (out of the stage-only view too); `clear` empties it, with CLEAR's undo */
  edit(clear?: boolean): void;
  /** share a link to this mode with the program as it is now (system share sheet, else the clipboard) */
  share(): void;
}

/** What the mode paints behind the editor text. The editor owns the two canvases and the loop. */
export interface Backdrop {
  /** size in CSS pixels */
  resize(w: number, h: number): void;
  /** a glyph was typed at the caret (x, y); '' when the caret only moved */
  typed(ch: string, x: number, y: number): void;
  /** back: behind the text, front: over it; both already scaled to CSS pixels */
  draw(back: CanvasRenderingContext2D, front: CanvasRenderingContext2D, dt: number): void;
}

/** the status line in the header: "<ok> · <count> <unit> · <glyphs> GLYPHS" */
export interface Status {
  ok: string;
  count: number;
  unit: string;
}

/** extra sections a mode adds to the program drawer */
export interface DrawerSection {
  title: string;
  items: HTMLElement[];
}
export interface DrawerContext {
  audio: AudioEngine;
  /** a drawer row: name, a smaller line underneath, an action; an icon in front, e.g. `check` for the setting in use */
  item(name: string, sub: string, onPick: () => void, icon?: IconName): HTMLElement;
  /** rebuild the drawer (after a setting changed) */
  refresh(): void;
}

/** one card of the cheat sheet (the book in the header): a snippet, what it does, and a picture of it */
export interface SheetCard {
  /** the picture is src/modes/<mode>/sheet/<id>.webp, rendered by `bun scripts/sheet.ts` */
  id: string;
  code: string;
  /** a short name, e.g. "spell" or "amoeba" */
  name: string;
  /** URL of the picture; missing until the script has rendered it */
  img?: string;
  /** seconds the snippet runs before the picture is taken */
  at: number;
  /** the picture's camera: this much closer than the app (1 = the whole stage); PETRI_ follows the first cell */
  zoom: number;
}
export interface Sheet {
  intro: string;
  cards: SheetCard[];
}

/**
 * What the shell knows about a mode before its code has loaded: enough for the header, the theme
 * and the mode select. Lives in the main bundle, so keep it small.
 */
export interface ModeDef {
  /** storage keys, the mode select, window.KEYMASH */
  id: string;
  /** shown as the logo, e.g. "PETRI_" */
  name: string;
  /** header icon, inline SVG markup */
  icon: string;
  tagline: string;
  /** <meta name="theme-color"> */
  themeColor: string;
  /** theme class (createTheme in the mode's theme.css.ts), set on <html> */
  theme: string;
  /** class on #app that animates switching into the mode and in/out of play */
  transition: string;
  /** the rest of the mode, a separate chunk fetched on first use: `() => import('./mode').then((m) => m.mode)` */
  load(): Promise<ModeCode>;
}

/** A mode's code: the editor backdrop, the player, the cheat sheet, … */
export interface ModeCode {
  /** toast when RUN gets an empty text and a paw fills it (the toast ends in the paw icon) */
  emptyToast: string;
  /** under RUN when only the stage shows: what RUN does here, e.g. "bake the cookies" */
  runHint: string;
  /** typing sounds in the editor */
  typing: TypingStyle;
  demos: Demo[];
  /** key bar entries after the cursor keys */
  keys: string[];
  /** the cheat sheet behind the book in the header */
  sheet: Sheet;
  backdrop(): Backdrop;
  status(src: string): Status;
  player(audio: AudioEngine, host: PlayerHost): ModePlayer;
  drawer?(ctx: DrawerContext): DrawerSection[];
  /** a second view the header opens (PETRI_'s lab) */
  view?: ModeView;
}

/** a second view a mode opens from the header (PETRI_'s lab); it covers the whole app until it calls close() */
export interface ModeView {
  icon: IconName;
  /** title and aria-label of the header button */
  title: string;
  open(ctx: ViewContext): void;
  /** true when the view was open as the page was left: the shell opens it again at start (a reload keeps it) */
  reopen?(): boolean;
}
export interface ViewContext {
  /** #app: the view adds its own element */
  root: HTMLElement;
  audio: AudioEngine;
  /** a program was running; the shell has just stopped it */
  wasPlaying: boolean;
  /** back to the editor */
  close(): void;
}
