import { globalStyle, keyframes, style, styleVariants } from '@vanilla-extract/css';
import { vars, layout, rgba, blink } from '../../styles/theme.css';

/** the <km-button> element itself takes no space: its <button> is the flex item */
export const host = style({ display: 'contents' });

const base = style({
  flex: 1,
  height: 46,
  minWidth: 0,
  padding: '0 4px',
  overflow: 'hidden',
  textOverflow: 'clip',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  borderRadius: vars.radius.row,
  background: vars.color.surface,
  color: vars.color.text,
  border: `1px solid ${vars.color.border}`,
  fontSize: 12,
  letterSpacing: 0.5,
  textShadow: vars.shadow.text,
  touchAction: 'manipulation',
});

export const variant = styleVariants({
  /** RUN, MASH, …: icon over a label */
  control: [
    base,
    {
      height: 70,
      borderRadius: vars.radius.control,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      selectors: { '&:active': { transform: 'scale(.95)' } },
    },
  ],
  /** over the stage: sound, restart, back to the editor */
  play: [
    base,
    {
      flex: '0 0 auto',
      height: 60,
      minWidth: 64,
      padding: '0 16px',
      fontSize: 22,
      borderRadius: vars.radius.control,
      selectors: { '&:active': { transform: 'scale(.95)' } },
    },
  ],
  /** small, in the drawer */
  row: [base, { flex: '0 0 auto', width: 46 }],
  /** square, in the header */
  header: [
    base,
    { flex: '0 0 auto', width: 52, height: 52, padding: 0, fontSize: 22, borderRadius: vars.radius.control, textShadow: 'none' },
  ],
  /** tiny, in the stage's top right corner: fullscreen */
  corner: [
    base,
    {
      top: `calc(8px + ${layout.safeTop})`,
      right: 'calc(8px + var(--pr, 0px))',
      zIndex: 6,
      width: 34,
      height: 34,
      padding: 0,
      fontSize: 18,
      lineHeight: 1,
      opacity: 0.6,
      background: 'rgba(0,0,0,.35)',
      selectors: { '&:hover, &:focus-visible': { opacity: 1 }, '&:active': { transform: 'scale(.92)' } },
    },
  ],
  /** the big RUN in the empty stage (split view) */
  idle: [
    base,
    {
      flex: '0 0 auto',
      height: 'auto',
      fontSize: 28,
      padding: '18px 40px',
      borderRadius: vars.radius.control,
      border: 0,
      fontWeight: 'bold',
    },
  ],
});
export type Variant = keyof typeof variant;

// primary: the one button to press
const primary = `${host}[primary] > button`;
globalStyle(primary, {
  background: vars.bg.primary,
  color: vars.color.primaryFg,
  textShadow: 'none',
  fontWeight: 'bold',
  boxShadow: vars.shadow.primary,
});
globalStyle(`${host}[primary] > ${variant.control}`, { flex: 1.4 });
globalStyle(`${host}[primary] > ${variant.play}`, { fontSize: 18 });
globalStyle(`${host}[primary] > ${variant.idle}`, { animation: `${blink} 1.6s infinite` });

// icon over label (control); icon beside label elsewhere
globalStyle(`${variant.control} i`, { fontStyle: 'normal', fontSize: 26, lineHeight: 1, textShadow: 'none' });
globalStyle(`${variant.control} span`, { fontSize: 11, letterSpacing: 1, '@media': { '(max-width: 380px)': { fontSize: 10 } } });
globalStyle(`${host}[primary] > ${variant.control} i`, { fontSize: 30 });
globalStyle(`${host}[primary] > ${variant.control} span`, { fontSize: 15, fontWeight: 'bold' });
globalStyle(`${variant.play} i, ${variant.idle} i, ${variant.row} i, ${variant.header} i, ${variant.corner} i`, { fontStyle: 'normal' });
globalStyle(`${variant.play} i + span:not(:empty), ${variant.idle} i + span:not(:empty)`, { marginLeft: '0.4em' });

// countdown(): a fill inside the button drains from right to left
const drain = keyframes({ from: { transform: 'scaleX(1)' }, to: { transform: 'scaleX(0)' } });
const counting = `${host}[counting] > button`;
globalStyle(`${host} > button`, { position: 'relative' });
globalStyle(`${host} > button > *`, { position: 'relative', zIndex: 1 });
globalStyle(`${host} > ${variant.corner}`, { position: 'absolute' }); // pinned to the stage corner, not part of a row
globalStyle(counting, { borderColor: rgba(vars.rgb.accent, 1), color: '#fff', boxShadow: `0 0 16px ${rgba(vars.rgb.accent, 0.35)}` });
globalStyle(`${counting}::before`, {
  content: '""',
  position: 'absolute',
  inset: 0,
  borderRadius: 'inherit',
  zIndex: 0,
  transformOrigin: 'left center',
  background: `linear-gradient(90deg, ${rgba(vars.rgb.accent, 0.55)}, ${rgba(vars.rgb.accent, 0.22)})`,
  animation: `${drain} var(--countdown, 6s) linear forwards`,
});
