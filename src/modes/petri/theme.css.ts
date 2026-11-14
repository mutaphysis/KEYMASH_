// PETRI_: aqua on deep teal, no scanlines, soft round shapes, italic serif for the living things.
import { createTheme, globalStyle, keyframes, style } from '@vanilla-extract/css';
import { vars, layout } from '../../styles/theme.css';
import { icon } from '../../ui/components/mode-icon.css';
import { variant } from '../../ui/components/button.css';

export const petriTheme = createTheme(vars, {
  rgb: { fg: '143, 245, 220', accent: '255, 168, 207', accent2: '168, 220, 255' },
  color: {
    bg: '#010a0d',
    dim: '#7fb8b0',
    text: '#bff8ea',
    code: '#cdfaf0',
    surface: 'rgba(2,22,26,.7)',
    panel: '#011318',
    editorBg: 'rgba(1,16,20,.88)',
    border: 'rgba(143,245,220,.3)',
    line: 'rgba(143,245,220,.26)',
    stageBg: '#010608',
    primaryFg: '#022126',
  },
  bg: {
    app: 'radial-gradient(ellipse at 50% 20%, #06222a, #010a0d 70%)',
    primary: 'linear-gradient(160deg, #a8fbe6, #5fd6c4)',
    codeview: 'linear-gradient(#01121a, #010a0d)',
  },
  shadow: {
    text: 'none',
    code: '0 0 8px rgba(143,245,220,.45)',
    editor: '0 0 0 1px rgba(143,245,220,.06) inset, 0 0 40px rgba(60,200,190,.10) inset, 0 0 24px rgba(60,200,190,.10)',
    primary: '0 0 24px rgba(95,214,196,.45)',
  },
  radius: { control: '18px', row: '12px', key: '16px', frame: '18px', sheet: '18px' },
});

const focusPull = keyframes({
  '0%': { filter: 'blur(14px) brightness(.6) saturate(.6)' },
  '60%': { filter: 'blur(2px) brightness(1.05)' },
  '100%': { filter: 'none' },
});
/** switching in, starting and stopping: the microscope finds its focus */
export const focus = style({ animation: `${focusPull} 1.1s ease-out` });

const breathe = keyframes({ '50%': { transform: 'scale(1.06) rotate(4deg)' } });
const p = (sel: string) => `${petriTheme} ${sel}`;

// calm: no scanlines, no flicker, no glitching logo, nothing blinks
globalStyle(p('.crt::before'), { display: 'none' });
globalStyle(p('.crt::after'), {
  background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 60%, rgba(0,0,0,.55) 100%)',
  mixBlendMode: 'normal',
});
globalStyle(p('.logo'), { textShadow: '0 0 10px rgba(143,245,220,.7), 0 0 26px rgba(143,245,220,.3)', letterSpacing: 2 });
globalStyle(p('.logo::before, .logo::after'), { display: 'none' });
globalStyle(p(`${icon} svg`), { filter: 'drop-shadow(0 0 7px rgba(143,245,220,.6))', animation: `${breathe} 6s ease-in-out infinite` });
globalStyle(p('#status .ok'), { animation: 'none' });
globalStyle(p('#editorWrap.pulse'), { animation: 'none' });
globalStyle(p('#rain'), { opacity: 0.9 });
globalStyle(p(`[primary] > ${variant.idle}`), { animation: 'none' });

// the code view fades slowly, like stained cells
globalStyle(p('#codeview span'), { transition: 'background-color 1.4s ease-out, color 1.4s ease-out, box-shadow 1.4s' });
globalStyle(p('#codeview span.on'), { boxShadow: '0 0 14px var(--c)', borderRadius: 4 });

// census and field notes
globalStyle(p('#hud'), { color: 'rgba(205,250,240,.85)', lineHeight: 1.55, letterSpacing: 0.3 });
globalStyle(p('#hud .sp'), { whiteSpace: 'nowrap' });
globalStyle(p('#hud .sp i'), { fontFamily: layout.serif, fontSize: 12.5, color: '#e4fff8' });
globalStyle(p('#hud .sp b'), { color: '#8ff5dc', fontWeight: 'normal', marginLeft: 4 });
globalStyle(p('#hud .sp.gone'), { opacity: 0.4 });
globalStyle(p('#hud .dot'), { width: 8, height: 8, borderRadius: '50%', marginRight: 6, boxShadow: '0 0 6px currentColor' });
globalStyle(p('#hud .meta'), { marginTop: 3, color: 'rgba(143,245,220,.55)', fontSize: 10.5 });
globalStyle(p('#log'), { fontFamily: layout.serif, fontStyle: 'italic', fontSize: 12.5, color: 'rgba(205,250,240,.78)', bottom: 76 });
globalStyle(p('#log div:last-child::after'), { content: '""' });
globalStyle(p('#boot'), {
  background: 'radial-gradient(circle at 50% 45%, #06262d, #010a0d 75%)',
  color: '#a8fbe6',
  textShadow: '0 0 10px rgba(143,245,220,.6)',
  fontSize: 14,
});
