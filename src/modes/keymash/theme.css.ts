// KEYMASH_: phosphor green on black, CRT scanlines, glitchy.
import { createTheme, keyframes, style } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

export const keymashTheme = createTheme(vars, {
  rgb: { fg: '57, 255, 122', accent: '255, 46, 136', accent2: '41, 243, 255' },
  color: {
    bg: '#000800',
    dim: '#6fbf87',
    text: '#39ff7a',
    code: '#b6ffcc',
    surface: 'rgba(0,0,0,.6)',
    panel: '#010d05',
    editorBg: 'rgba(0,12,4,.9)',
    border: 'rgba(57,255,122,.45)',
    line: 'rgba(57,255,122,.35)',
    stageBg: '#000',
    primaryFg: '#000',
  },
  bg: { app: 'transparent', primary: '#39ff7a', codeview: 'linear-gradient(#000a03, #000)' },
  shadow: {
    text: '0 0 6px rgba(57,255,122,.7)',
    code: '0 0 6px rgba(57,255,122,.9), 0 0 16px rgba(57,255,122,.45)',
    editor: '0 0 0 1px rgba(57,255,122,.08) inset, 0 0 30px rgba(57,255,122,.12) inset, 0 0 18px rgba(57,255,122,.15)',
    primary: '0 0 18px rgba(57,255,122,.6)',
  },
  radius: { control: '12px', row: '6px', key: '10px', frame: '6px', sheet: '0' },
});

const switchGlitch = keyframes({
  '0%': { filter: 'hue-rotate(0) contrast(1)', transform: 'translateY(var(--vt))' },
  '25%': { filter: 'hue-rotate(90deg) contrast(2)', transform: 'translate(6px, var(--vt)) skewX(4deg)' },
  '50%': { filter: 'invert(1)', transform: 'translate(-6px, var(--vt))' },
  '75%': { filter: 'hue-rotate(200deg) saturate(3)', transform: 'translateY(var(--vt)) scaleY(.98)' },
  '100%': { filter: 'none' },
});
/** switching in, starting and stopping: a short glitch */
export const glitch = style({ animation: `${switchGlitch} .35s steps(4)` });
