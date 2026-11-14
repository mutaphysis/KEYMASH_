// What a mode is. Every mode lives in src/modes/<id>/ and exports one ModeDef;
// src/modes/index.ts lists them. The app shell (main.ts, the drawer, the editor, storage)
// reads everything mode specific from here.
import type { AudioEngine, TypingStyle } from '../engine/audio';
import type { Demo } from '../ui/storage';

/** Play mode: owns the shared stage (#stage, #hud, #log, #boot, #codeview) between start() and stop(). */
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
export interface Status { ok: string; count: number; unit: string }

/** extra sections a mode adds to the program drawer */
export interface DrawerSection { title: string; items: HTMLElement[] }
export interface DrawerContext {
  audio: AudioEngine;
  /** a drawer row: name, a smaller line underneath, an action */
  item(name: string, sub: string, onPick: () => void): HTMLElement;
  /** rebuild the drawer (after a setting changed) */
  refresh(): void;
}

export interface ModeDef {
  /** storage keys, the mode select, window.KEYMASH */
  id: string;
  /** shown as the logo, e.g. "PETRI_" */
  name: string;
  /** emoji in the mode select (an <option> can't show the SVG icon) */
  glyph: string;
  /** header icon, inline SVG markup */
  icon: string;
  tagline: string;
  /** toast when RUN gets an empty text and a paw fills it */
  emptyToast: string;
  /** <meta name="theme-color"> */
  themeColor: string;
  /** theme class (createTheme in the mode's theme.css.ts), set on <html> */
  theme: string;
  /** class on #app that animates switching into the mode and in/out of play */
  transition: string;
  /** typing sounds in the editor */
  typing: TypingStyle;
  demos: Demo[];
  /** key bar entries after the cursor keys */
  keys: string[];
  backdrop(): Backdrop;
  status(src: string): Status;
  player(audio: AudioEngine): ModePlayer;
  drawer?(ctx: DrawerContext): DrawerSection[];
}
