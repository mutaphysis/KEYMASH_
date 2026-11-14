// The cheat sheet's cards: a picture, the snippet, its name. Each card is a button (tap: add the snippet).
import { globalStyle, style } from '@vanilla-extract/css';
import { vars, layout, rgba } from '../../styles/theme.css';

const fg = vars.rgb.fg;

export const intro = style({ margin: '0 2px 12px', fontSize: 13, lineHeight: 1.5, color: vars.color.text, maxWidth: '60em' });
// 12 cards: 2, 3, 4 or 6 columns, so the last row is always full (6 × 2 on a desktop)
export const grid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 10,
  '@media': {
    '(min-width: 560px)': { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' },
    '(min-width: 760px)': { gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' },
    '(min-width: 1080px)': { gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' },
  },
});
/** the <km-card> element takes no space: its <button> is the grid item */
export const host = style({ display: 'contents' });
export const card = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  minWidth: 0,
  padding: 0,
  overflow: 'hidden',
  textAlign: 'left',
  font: 'inherit',
  cursor: 'pointer',
  touchAction: 'manipulation',
  borderRadius: vars.radius.row,
  background: vars.color.surface,
  color: vars.color.text,
  border: `1px solid ${vars.color.border}`,
  selectors: {
    '&:active': { transform: 'scale(.97)' },
    '&:focus-visible': { outline: `1px solid ${rgba(fg, 1)}`, outlineOffset: 2 },
  },
});
globalStyle(`${card} img`, { display: 'block', width: '100%', aspectRatio: '16 / 10', objectFit: 'cover', background: '#000' });
globalStyle(`${card} code`, {
  display: 'block',
  padding: '8px 10px 2px',
  font: `16px/1.35 ${layout.mono}`,
  color: rgba(fg, 1),
  textShadow: vars.shadow.text,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
});
globalStyle(`${card} span`, { display: 'block', padding: '2px 10px 10px', fontSize: 12, lineHeight: 1.4, opacity: 0.8 });
