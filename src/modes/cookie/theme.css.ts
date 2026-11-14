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

/** the round, heavy face the piped letters on the cookies use too */
export const ROUNDED =
  'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Varela Round", Nunito, "Comic Sans MS", system-ui, sans-serif';

/** the message on the finished cookies: big, round and outlined in the cookie's own colours (the player sets --fill, --line, --size) */
export const greeting = style({
  position: 'absolute',
  left: 12,
  right: 12,
  bottom: 84, // just above the play buttons
  textAlign: 'center',
  fontFamily: ROUNDED,
  fontWeight: 900,
  fontSize: 'var(--size, 56px)',
  lineHeight: 1.08,
  color: 'var(--fill, #fff4e2)',
  WebkitTextStroke: '.15em var(--line, #4a2810)',
  paintOrder: 'stroke fill', // the outline goes around the letters, not into them
  textShadow: '0 .08em 0 var(--line, #4a2810), 0 .16em .3em rgba(0,0,0,.45)',
  pointerEvents: 'none',
  opacity: 0,
  transform: 'scale(.6) translateY(.4em)',
  transformOrigin: '50% 100%',
  transition: 'opacity .45s ease, transform .75s cubic-bezier(.3, 1.7, .5, 1)',
  selectors: { '&.on': { opacity: 1, transform: 'none' } },
  '@media': { '(prefers-reduced-motion: reduce)': { transform: 'none', transition: 'opacity .8s ease' } },
});

export const greetWord = style({ display: 'inline-block', whiteSpace: 'nowrap' });

const hop = keyframes({
  '0%, 100%': { transform: 'translateY(0) rotate(-2deg)' },
  '50%': { transform: 'translateY(-.08em) rotate(2deg)' },
});
/** each letter hops a little, a wave running along the line */
export const greetLetter = style({
  display: 'inline-block',
  animation: `${hop} 1.4s ease-in-out infinite`,
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
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
globalStyle(p('#log'), {
  fontFamily: layout.serif,
  fontStyle: 'italic',
  fontSize: 12.5,
  color: 'rgba(255,240,220,.82)',
  bottom: 76,
  transition: 'opacity .5s ease',
});
// the greeting takes the bottom of the stage; the notes step aside meanwhile
globalStyle(p(`#log:has(~ .${greeting}.on)`), { opacity: 0 });
globalStyle(p('#log div:last-child::after'), { content: '""' });
globalStyle(p('#boot'), {
  background: 'radial-gradient(circle at 50% 45%, #3a2212, #140c08 75%)',
  color: '#ffe0b0',
  textShadow: '0 0 10px rgba(255,214,165,.5)',
  fontSize: 14,
});
