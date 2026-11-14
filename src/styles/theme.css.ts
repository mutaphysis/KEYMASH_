// The design tokens every mode fills in. A mode's theme (src/modes/<id>/theme.css.ts) calls
// createTheme(vars, {...}); tsc fails if a token is missing. The theme class goes on <html>.
// Colours that appear at several opacities are RGB triplets: rgba(${vars.rgb.fg}, .45).
import { createGlobalTheme, createThemeContract } from '@vanilla-extract/css';

export const vars = createThemeContract({
  rgb: {
    /** the mode's signature colour: text, borders, glow */
    fg: null,
    /** warnings, LIVE, UNDO, selection */
    accent: null,
    /** cursor keys in the key bar */
    accent2: null,
  },
  color: {
    /** page background */
    bg: null,
    /** quiet text: the status line, drawer headings */
    dim: null,
    /** text on buttons */
    text: null,
    /** the program text in the editor and the code view */
    code: null,
    /** button background */
    surface: null,
    /** drawer panel and option lists */
    panel: null,
    editorBg: null,
    /** button borders */
    border: null,
    /** frames and separators: editor, key bar keys, stage edge */
    line: null,
    stageBg: null,
    primaryFg: null,
  },
  bg: {
    /** behind the whole app (a colour or a gradient) */
    app: null,
    primary: null,
    codeview: null,
  },
  shadow: {
    /** glow on button text ('none' for a calm mode) */
    text: null,
    code: null,
    editor: null,
    primary: null,
  },
  radius: {
    /** RUN, MASH, … and the play buttons */
    control: null,
    /** drawer rows, selects, the toast */
    row: null,
    /** key bar keys */
    key: null,
    /** the editor frame */
    frame: null,
    /** top corners of the drawer sheet */
    sheet: null,
  },
});

/** not themed: fonts, safe areas, and the visible viewport that JS keeps up to date */
export const layout = createGlobalTheme(':root', {
  mono: '"Share Tech Mono", ui-monospace, Menlo, Consolas, monospace',
  display: '"Major Mono Display", "Share Tech Mono", ui-monospace, monospace',
  serif: 'Georgia, "Iowan Old Style", serif',
  safeTop: 'env(safe-area-inset-top, 0px)',
  safeBottom: 'env(safe-area-inset-bottom, 0px)',
  safeLeft: 'env(safe-area-inset-left, 0px)',
  safeRight: 'env(safe-area-inset-right, 0px)',
});

/** rgba() of a triplet token */
export const rgba = (triplet: string, a: number): string => `rgba(${triplet}, ${a})`;
