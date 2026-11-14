// COOKIE_: warm kitchen light. Cream on dark chocolate, no scanlines, round shapes, serif for the baker's notes.
import { createTheme, globalStyle, keyframes, style } from '@vanilla-extract/css';
import { vars, layout } from '../../styles/theme.css';
import { variant } from '../../ui/components/button.css';

export const cookieTheme = createTheme(vars, {
  rgb: { fg: '255, 214, 165', accent: '255, 128, 150', accent2: '150, 220, 200' },
  color: {
    bg: '#140c08',
    dim: '#b39a80',
    text: '#ffe6c7',
    code: '#fff0dc',
    surface: 'rgba(40,24,14,.7)',
    panel: '#1c110a',
    editorBg: 'rgba(26,15,9,.88)',
    border: 'rgba(255,214,165,.3)',
    line: 'rgba(255,214,165,.24)',
    stageBg: '#0d0805',
    primaryFg: '#2a1608',
  },
  bg: {
    app: 'radial-gradient(ellipse at 50% 20%, #3a2212, #140c08 70%)',
    primary: 'linear-gradient(160deg, #ffe0b0, #f2a65a)',
    codeview: 'linear-gradient(#1c110a, #140c08)',
  },
  shadow: {
    text: 'none',
    code: '0 0 8px rgba(255,214,165,.4)',
    editor: '0 0 0 1px rgba(255,214,165,.06) inset, 0 0 40px rgba(255,170,90,.10) inset, 0 0 24px rgba(255,170,90,.10)',
    primary: '0 0 24px rgba(255,170,90,.45)',
  },
  radius: { control: '20px', row: '14px', key: '18px', frame: '20px', sheet: '20px' },
});

const ovenDoor = keyframes({
  '0%': { filter: 'brightness(1.5) sepia(.6)', transform: 'scale(.97)' },
  '100%': { filter: 'none', transform: 'none' },
});
/** switching in, starting and stopping: the oven door opens */
export const warm = style({ animation: `${ovenDoor} .7s ease-out` });

/** the mode's own canvas (WebGL; #stage already has a 2D context), on top of #stage while COOKIE_ plays */
export const stage3d = style({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  display: 'none',
  touchAction: 'none',
  selectors: { '&.on': { display: 'block' } },
});

/** the message on the finished cookies */
export const greeting = style({
  position: 'absolute',
  left: 16,
  right: 16,
  top: '12%',
  textAlign: 'center',
  fontFamily: layout.serif,
  fontStyle: 'italic',
  fontSize: 26,
  color: '#fff4e2',
  textShadow: '0 2px 18px rgba(0,0,0,.6)',
  pointerEvents: 'none',
  opacity: 0,
  letterSpacing: 6,
  transition: 'opacity 1.2s ease, letter-spacing 1.6s ease',
  selectors: { '&.on': { opacity: 1, letterSpacing: 1 } },
});

const p = (sel: string) => `${cookieTheme} ${sel}`;

// calm: no scanlines, no flicker, no glitching logo, nothing blinks
globalStyle(p('.crt::before'), { display: 'none' });
globalStyle(p('.crt::after'), {
  background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 60%, rgba(0,0,0,.5) 100%)',
  mixBlendMode: 'normal',
});
globalStyle(p('.logo'), { textShadow: '0 0 10px rgba(255,214,165,.6), 0 0 26px rgba(255,170,90,.3)', letterSpacing: 2 });
globalStyle(p('.logo::before, .logo::after'), { display: 'none' });
globalStyle(p('#status .ok'), { animation: 'none' });
globalStyle(p('#editorWrap.pulse'), { animation: 'none' });
globalStyle(p(`[primary] > ${variant.idle}`), { animation: 'none' });

globalStyle(p('#codeview span'), { transition: 'background-color 1.2s ease-out, color 1.2s ease-out, box-shadow 1.2s' });
globalStyle(p('#codeview span.on'), { boxShadow: '0 0 14px var(--c)', borderRadius: 4 });

// the baker's notes
globalStyle(p('#hud'), { color: 'rgba(255,240,220,.9)', lineHeight: 1.55, letterSpacing: 0.3 });
globalStyle(p('#hud .meta'), { color: 'rgba(255,214,165,.65)', fontSize: 10.5 });
globalStyle(p('#log'), { fontFamily: layout.serif, fontStyle: 'italic', fontSize: 12.5, color: 'rgba(255,240,220,.82)', bottom: 76 });
globalStyle(p('#log div:last-child::after'), { content: '""' });
globalStyle(p('#boot'), {
  background: 'radial-gradient(circle at 50% 45%, #3a2212, #140c08 75%)',
  color: '#ffe0b0',
  textShadow: '0 0 10px rgba(255,214,165,.5)',
  fontSize: 14,
});
