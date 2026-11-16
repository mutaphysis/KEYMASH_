// MYCELIUM_: bone and moss on dark humus. No scanlines, soft shapes, quiet.
import { createTheme, globalStyle, keyframes, style } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';
import { variant } from '../../ui/components/button.css';

export const myceliumTheme = createTheme(vars, {
  rgb: { fg: '217, 201, 163', accent: '159, 179, 122', accent2: '214, 160, 110' },
  color: {
    bg: '#0c0b08',
    dim: '#9c9078',
    text: '#e8dcc0',
    code: '#f2e8d2',
    surface: 'rgba(28,24,17,.7)',
    panel: '#14120d',
    editorBg: 'rgba(18,16,11,.88)',
    border: 'rgba(217,201,163,.28)',
    line: 'rgba(217,201,163,.22)',
    stageBg: '#070604',
    primaryFg: '#1c1a10',
  },
  bg: {
    app: 'radial-gradient(ellipse at 50% 20%, #26231a, #0c0b08 70%)',
    primary: 'linear-gradient(160deg, #dfe8c0, #9fb37a)',
    codeview: 'linear-gradient(#14120d, #0c0b08)',
  },
  shadow: {
    text: 'none',
    code: '0 0 8px rgba(217,201,163,.35)',
    editor: '0 0 0 1px rgba(217,201,163,.06) inset, 0 0 40px rgba(159,179,122,.08) inset, 0 0 24px rgba(159,179,122,.08)',
    primary: '0 0 24px rgba(159,179,122,.4)',
  },
  radius: { control: '16px', row: '12px', key: '14px', frame: '16px', sheet: '16px' },
});

const rise = keyframes({
  '0%': { filter: 'brightness(.4) saturate(.5)', transform: 'translateY(6px)' },
  '100%': { filter: 'none', transform: 'none' },
});
/** switching in, starting and stopping: the picture rises out of the dark */
export const sprout = style({ animation: `${rise} .9s ease-out` });

/** the mode's own canvas (WebGL; #stage already has a 2D context), on top of #stage while MYCELIUM_ plays */
export const stage3d = style({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  display: 'none',
  touchAction: 'none',
  cursor: 'grab',
  selectors: { '&.on': { display: 'block' }, '&.drag': { cursor: 'grabbing' } },
});

const p = (sel: string) => `${myceliumTheme} ${sel}`;

// calm: no scanlines, no flicker, no glitching logo, nothing blinks
globalStyle(p('.crt::before'), { display: 'none' });
globalStyle(p('.crt::after'), {
  background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 60%, rgba(0,0,0,.5) 100%)',
  mixBlendMode: 'normal',
});
globalStyle(p('.logo'), { textShadow: '0 0 10px rgba(217,201,163,.5), 0 0 24px rgba(159,179,122,.25)', letterSpacing: 2 });
globalStyle(p('.logo::before, .logo::after'), { display: 'none' });
globalStyle(p('#status .ok'), { animation: 'none' });
globalStyle(p('#editorWrap.pulse'), { animation: 'none' });
globalStyle(p(`[primary] > ${variant.idle}`), { animation: 'none' });
globalStyle(p('#boot'), {
  background: 'radial-gradient(circle at 50% 45%, #26231a, #0c0b08 75%)',
  color: '#e8dcc0',
  textShadow: '0 0 10px rgba(217,201,163,.4)',
  fontSize: 14,
});
