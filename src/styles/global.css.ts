// The app shell: page, layout (phone / split view), header, editor, key bar, controls and play area.
// The shared widgets (buttons, drawer, toast, …) style themselves in src/ui/components/.
// Colours, glows and corner radii come from the mode theme (theme.css.ts); what a theme
// can't express lives in the mode's own theme.css.ts.
import { globalStyle, keyframes } from '@vanilla-extract/css';
import { vars, layout, rgba, blink } from './theme.css';

const fg = vars.rgb.fg;
const accent = vars.rgb.accent;
const accent2 = vars.rgb.accent2;
/** per pane: only pad the screen edges the pane touches (see the split view) */
const padL = (px: number) => `calc(${px}px + var(--pl))`;
const padR = (px: number) => `calc(${px}px + var(--pr))`;

const flicker = keyframes({ '0%, 100%': { opacity: 0.6 }, '37%': { opacity: 1 }, '38%': { opacity: 0.3 }, '39%': { opacity: 1 }, '80%': { opacity: 0.8 } });
const glitchA = keyframes({
  '0%': { clipPath: 'inset(0 0 85% 0)' }, '20%': { clipPath: 'inset(40% 0 40% 0)' }, '40%': { clipPath: 'inset(80% 0 2% 0)' },
  '60%': { clipPath: 'inset(10% 0 70% 0)' }, '80%': { clipPath: 'inset(60% 0 20% 0)' }, '100%': { clipPath: 'inset(30% 0 60% 0)' },
});
const glitchB = keyframes({
  '0%': { clipPath: 'inset(70% 0 10% 0)' }, '25%': { clipPath: 'inset(5% 0 80% 0)' }, '50%': { clipPath: 'inset(50% 0 30% 0)' },
  '75%': { clipPath: 'inset(20% 0 65% 0)' }, '100%': { clipPath: 'inset(90% 0 0 0)' },
});
const wrapPulse = keyframes({ '0%': { boxShadow: `0 0 40px ${rgba(fg, 0.5)} inset, 0 0 30px ${rgba(fg, 0.5)}` } });
const nojsIn = keyframes({ to: { opacity: 1 } });

// ---------- page ----------
globalStyle(':root', { vars: { '--vh': '100dvh', '--vt': '0px' } });
globalStyle('*', { boxSizing: 'border-box', WebkitTapHighlightColor: 'transparent', WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' });
globalStyle('html, body', { margin: 0, height: '100%', background: vars.color.bg, overflow: 'hidden', overscrollBehavior: 'none' });
globalStyle('body', { color: rgba(fg, 1), fontFamily: layout.mono, position: 'fixed', inset: 0 });
globalStyle('button, select', { fontFamily: layout.mono });

// Fills the screen edge to edge (installed iOS web app included). Only while the on-screen keyboard
// is open does JS pin it to the visible part (--vh / --vt).
globalStyle('#app', { position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: vars.bg.app });
globalStyle('#app.kbd', { bottom: 'auto', height: 'var(--vh)', transform: 'translateY(var(--vt))' });
// safe-area side padding per pane: each pane only pads the screen edges it actually touches
globalStyle('#edit, #play', { vars: { '--pl': layout.safeLeft, '--pr': layout.safeRight } });
globalStyle('#app.split #edit', { vars: { '--pr': '0px' } });
globalStyle('#app.split #play', { vars: { '--pl': '0px' } });
// nothing is selectable except the program text
globalStyle('#code', { WebkitUserSelect: 'text', userSelect: 'text', WebkitTouchCallout: 'default' });
globalStyle('section', { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 });
globalStyle('section[hidden]', { display: 'none' });

// CRT feel: scanlines + vignette over everything
globalStyle('.crt::after', {
  content: '""', position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 50, mixBlendMode: 'multiply',
  background: 'repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0, rgba(0,0,0,0) 2px, rgba(0,0,0,.22) 3px), radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,.65) 100%)',
});
globalStyle('.crt::before', { content: '""', position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 51, background: rgba(fg, 0.025), animation: `${flicker} 4s infinite steps(1)` });

// ---------- header ----------
// compact: logo + version on top, status underneath, mute button to the right of both
globalStyle('header', {
  display: 'grid', gridTemplateColumns: 'auto auto minmax(0, 1fr) auto', gridTemplateAreas: '"icon logo ver mute" "icon status status mute"',
  alignItems: 'center', columnGap: 10, rowGap: 2, padding: `calc(4px + ${layout.safeTop}) ${padR(12)} 4px ${padL(12)}`,
});
globalStyle('header .logo', { gridArea: 'logo' });
globalStyle('header .ver', { gridArea: 'ver', fontSize: 10, color: rgba(fg, 0.45), letterSpacing: 0.5, alignSelf: 'end', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' });
globalStyle('header #status', { gridArea: 'status', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' });
globalStyle('header #btn-mute-edit > button', { gridArea: 'mute' });
globalStyle('.logo', {
  fontFamily: layout.display, fontSize: 24, lineHeight: 1.15, letterSpacing: 1, position: 'relative', color: rgba(fg, 1),
  textShadow: `0 0 8px ${rgba(fg, 1)}, 0 0 22px ${rgba(fg, 0.5)}`,
});
globalStyle('.logo::before, .logo::after', { content: 'attr(data-text)', position: 'absolute', left: 0, top: 0, width: '100%', overflow: 'hidden', textShadow: 'none', opacity: 0.8 });
globalStyle('.logo::before', { color: rgba(accent, 1), left: 2, animation: `${glitchA} 2.6s infinite linear alternate-reverse` });
globalStyle('.logo::after', { color: rgba(accent2, 1), left: -2, animation: `${glitchB} 3.1s infinite linear alternate-reverse` });
globalStyle('#status', { fontSize: 11, color: vars.color.dim, letterSpacing: 1 });
globalStyle('#status .ok', { color: rgba(fg, 1), animation: `${blink} 1.2s infinite steps(2)` });
globalStyle('#st-live', { display: 'none', color: rgba(accent, 1) });
globalStyle('#app.split.playing #st-live', { display: 'inline' });
// typing on a phone: squeeze the header
globalStyle('#app.kb header .ver, #app.kb #status', { display: 'none' });
globalStyle('#app.kb header', { gridTemplateAreas: '"icon logo ver mute"', paddingTop: `calc(2px + ${layout.safeTop})`, paddingBottom: 2 });
globalStyle('#app.kb .logo', { fontSize: 20 });
globalStyle('#app.kb #btn-mute-edit > button', { width: 44, height: 40 });
globalStyle('#app.kb #controls button', { height: 56 });
globalStyle('#app.kbd #controls', { paddingBottom: 8 }); // the keyboard covers the home indicator

// ---------- editor ----------
globalStyle('#editorWrap', {
  position: 'relative', flex: 1, minHeight: 80, margin: `4px ${padR(10)} 4px ${padL(10)}`, overflow: 'hidden',
  border: `1px solid ${vars.color.line}`, borderRadius: vars.radius.frame, boxShadow: vars.shadow.editor, background: vars.color.editorBg,
});
globalStyle('#rain, #sparks', { position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' });
globalStyle('#rain', { opacity: 0.55 });
globalStyle('#code', {
  position: 'absolute', inset: 0, width: '100%', height: '100%', resize: 'none', border: 0, outline: 0, background: 'transparent',
  color: vars.color.code, caretColor: rgba(fg, 1), padding: '14px 14px 40px', margin: 0,
  font: `20px/1.45 ${layout.mono}`, letterSpacing: 0.5, whiteSpace: 'pre-wrap', wordBreak: 'break-all', overflowWrap: 'anywhere',
  textShadow: vars.shadow.code, WebkitAppearance: 'none', appearance: 'none', borderRadius: 0, zIndex: 2,
});
globalStyle('#code::placeholder', { color: rgba(fg, 0.35), textShadow: 'none' });
globalStyle('#code::selection', { background: rgba(accent, 0.45), color: '#fff' });
globalStyle('#editorWrap.pulse', { animation: `${wrapPulse} .25s ease-out` });

// ---------- key bar ----------
const fade = 'linear-gradient(to right, transparent 0, #000 14px, #000 calc(100% - 28px), transparent 100%)';
globalStyle('#keybar', {
  display: 'flex', gap: 8, padding: `8px ${padR(10)} 8px ${padL(10)}`, overflowX: 'auto', scrollbarWidth: 'none', flex: '0 0 auto',
  // soft edges hint that there is more to scroll
  WebkitMaskImage: fade, maskImage: fade,
  '@media': {
    '(hover: hover) and (pointer: fine)': { cursor: 'grab', scrollbarWidth: 'thin', scrollbarColor: `${rgba(fg, 0.35)} transparent`, paddingBottom: 6 },
  },
});
globalStyle('#keybar::-webkit-scrollbar', { display: 'none', '@media': { '(hover: hover) and (pointer: fine)': { display: 'block', height: 6 } } });
globalStyle('#keybar::-webkit-scrollbar-thumb', { background: rgba(fg, 0.35), borderRadius: 3 });
globalStyle('#keybar.dragging, #keybar.dragging button', { cursor: 'grabbing' });
globalStyle('#keybar button', {
  flex: '0 0 auto', minWidth: 56, height: 56, padding: '0 12px', borderRadius: vars.radius.key, fontSize: 26,
  background: rgba(fg, 0.07), border: `1px solid ${vars.color.line}`, color: vars.color.text, touchAction: 'manipulation',
});
globalStyle('#keybar button.nav', { background: rgba(accent2, 0.09), borderColor: rgba(accent2, 0.35), color: rgba(accent2, 1) });
globalStyle('#keybar button:active', { background: rgba(fg, 1), color: vars.color.primaryFg, boxShadow: `0 0 14px ${rgba(fg, 0.8)}` });

// ---------- controls ----------
globalStyle('#controls', {
  display: 'flex', gap: 8, padding: `4px ${padR(10)} calc(10px + ${layout.safeBottom}) ${padL(10)}`, flex: '0 0 auto',
  '@media': { '(max-width: 380px)': { gap: 6 } },
});

// ---------- play mode ----------
globalStyle('#stageWrap', { position: 'relative', flex: '0 0 62%', minHeight: 0, background: vars.color.stageBg, borderBottom: `1px solid ${vars.color.line}` });
globalStyle('#stage', { position: 'absolute', inset: 0, display: 'block', touchAction: 'none' });
globalStyle('#hud', {
  position: 'absolute', left: padL(10), top: `calc(8px + ${layout.safeTop})`, fontSize: 11, color: rgba(fg, 0.85),
  textShadow: '0 0 6px #000', pointerEvents: 'none', letterSpacing: 1, lineHeight: 1.5,
});
globalStyle('#hud .dot', { display: 'inline-block', width: 9, height: 9, borderRadius: 2, marginRight: 3, verticalAlign: -1, transition: 'transform .08s, opacity .3s' });
globalStyle('#log', {
  position: 'absolute', left: padL(10), bottom: 80, right: padR(10), fontSize: 11, lineHeight: 1.45, color: 'rgba(130,255,170,.9)',
  pointerEvents: 'none', textShadow: '0 0 4px #000, 0 0 2px #000', whiteSpace: 'nowrap', overflow: 'hidden',
});
globalStyle('#log div', { overflow: 'hidden', textOverflow: 'ellipsis' });
globalStyle('#log div:last-child::after', { content: '"█"', animation: `${blink} .8s infinite steps(2)` });
globalStyle('#boot', {
  position: 'absolute', inset: 0, background: '#000', color: rgba(fg, 1), fontSize: 15, whiteSpace: 'pre', display: 'none', zIndex: 5,
  padding: `calc(24px + ${layout.safeTop}) ${padR(18)} 24px ${padL(18)}`, textShadow: `0 0 8px ${rgba(fg, 1)}`,
});
globalStyle('#boot.on', { display: 'block' });
globalStyle('#idle', {
  position: 'absolute', inset: 0, display: 'none', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, zIndex: 4,
  background: `radial-gradient(circle, ${vars.color.editorBg}, ${vars.color.bg} 70%)`,
});
globalStyle('#idle p', { color: rgba(fg, 0.6), fontSize: 13, margin: 0, letterSpacing: 1 });
globalStyle('#app.split:not(.playing) #idle', { display: 'flex' });
globalStyle('.playbtns', { position: 'absolute', right: padR(10), bottom: 10, display: 'flex', gap: 6 });
globalStyle('#codeview', {
  position: 'relative', flex: 1, overflowY: 'auto', padding: `14px ${padR(14)} calc(30vh + ${layout.safeBottom}) ${padL(14)}`,
  font: `18px/1.5 ${layout.mono}`, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: rgba(fg, 0.4), background: vars.bg.codeview, scrollbarWidth: 'none',
});
globalStyle('#codeview::-webkit-scrollbar', { display: 'none' });
globalStyle('#codeview span', { transition: 'background-color .7s ease-out, color .7s ease-out, text-shadow .7s', borderRadius: 2 });
globalStyle('#codeview span.on', { background: 'var(--c)', color: vars.color.primaryFg, transition: 'none', boxShadow: '0 0 12px var(--c)', textShadow: 'none' });
globalStyle('#codeview span.seen', { color: vars.color.code, textShadow: `0 0 6px ${rgba(fg, 0.6)}` });
// ---------- side by side (iPad landscape, desktop) ----------
globalStyle('#app.split', { flexDirection: 'row' });
globalStyle('#app.split section', { display: 'flex' });
globalStyle('#app.split #edit', { flex: '0 0 42%', maxWidth: 640, borderRight: `1px solid ${vars.color.line}` });
globalStyle('#app.split #play', { flex: 1 });
globalStyle('#app.split #stageWrap', { flex: '0 0 68%' });
globalStyle('#app.split #btn-stop', { display: 'none' });
globalStyle('#app.split #codeview', { paddingBottom: '40%', fontSize: 17 });
globalStyle('#app.split #controls button', { height: 64 });
globalStyle('#code', { '@media': { '(min-width: 800px)': { fontSize: 22 } } });
globalStyle('.logo', { '@media': { '(min-width: 800px)': { fontSize: 30 } } });

// ---------- fallback message: invisible for the first second so a normal start never flashes it ----------
globalStyle('#nojs', {
  position: 'fixed', inset: 0, zIndex: 100, background: '#000800', color: '#39ff7a', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14,
  padding: `calc(24px + ${layout.safeTop}) calc(24px + ${layout.safeRight}) calc(24px + ${layout.safeBottom}) calc(24px + ${layout.safeLeft})`,
  font: `16px/1.5 ${layout.mono}`, opacity: 0, animation: `${nojsIn} .3s 1s forwards`,
});
globalStyle('#nojs p', { margin: 0, maxWidth: '34em', color: '#9fe8b6' });
