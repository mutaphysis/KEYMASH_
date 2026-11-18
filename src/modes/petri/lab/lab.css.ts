// PETRI_'s lab: a full-app view. Phone: the dish on top, tools and the specimen drawer under it.
// Split view: a column on the left (bar, bench, drawer), the tools in a column beside the dish, the dish on the right.
import { globalStyle, keyframes, style } from '@vanilla-extract/css';
import { vars, layout, rgba } from '../../../styles/theme.css';

const fg = vars.rgb.fg;
const split = '#app.split &';
/** soft edges hint that a row scrolls (as the key bar) */
const fade = 'linear-gradient(to right, transparent 0, #000 14px, #000 calc(100% - 28px), transparent 100%)';

export const root = style({
  position: 'absolute',
  inset: 0,
  zIndex: 30,
  display: 'none',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gridTemplateRows: 'auto minmax(0, 1fr) auto auto',
  gridTemplateAreas: '"top" "dish" "tools" "drawer"',
  background: vars.bg.app,
  paddingLeft: layout.safeLeft,
  paddingRight: layout.safeRight,
  selectors: {
    '&.on': { display: 'grid' },
    [split]: {
      gridTemplateColumns: 'minmax(300px, min(42%, 640px)) auto minmax(0, 1fr)',
      gridTemplateRows: 'auto auto minmax(0, 1fr)',
      gridTemplateAreas: '"top tools dish" "bench tools dish" "drawer tools dish"',
    },
  },
});

/** everything in the left column of the split view gets a border on its right */
const column = { [split]: { borderRight: `1px solid ${vars.color.line}` } };

/** the lab's header is a shell <header> (the shell's styles lay it out), so it lines up with the editor's: the same
 * mode icon, logo, version, status and buttons in the same places */
export const top = style({
  gridArea: 'top',
  // the shell pads its panes by the safe areas they touch (--pl, --pr); the lab's root already keeps off them
  vars: { '--pl': '0px', '--pr': '0px' },
  selectors: column,
});

export const dish = style({
  gridArea: 'dish',
  position: 'relative',
  minHeight: 0,
  minWidth: 0,
  overflow: 'hidden',
});

export const canvas = style({ position: 'absolute', left: 0, top: 0, touchAction: 'none' });

export const tools = style({
  gridArea: 'tools',
  display: 'flex',
  gap: 8,
  padding: '8px 12px',
  overflowX: 'auto',
  scrollbarWidth: 'none',
  WebkitMaskImage: fade,
  maskImage: fade,
  selectors: {
    // split view: one column of tools along the dish's side, scrolling when the window is short
    [split]: {
      flexDirection: 'column',
      padding: `calc(8px + ${layout.safeTop}) 8px calc(8px + ${layout.safeBottom})`,
      overflowX: 'hidden',
      overflowY: 'auto',
      WebkitMaskImage: 'none',
      maskImage: 'none',
      borderRight: `1px solid ${vars.color.line}`,
    },
  },
});

/** the buttons that act at once (auto feed, clear, time): pushed to the toolbar's end, apart from the cursor tools */
export const acts = style({
  display: 'flex',
  gap: 8,
  marginLeft: 'auto',
  paddingLeft: 16,
  selectors: { [split]: { flexDirection: 'column', marginLeft: 0, paddingLeft: 0, marginTop: 'auto', paddingTop: 16 } },
});

export const drawer = style({
  gridArea: 'drawer',
  display: 'flex',
  gap: 8,
  minHeight: 0,
  padding: `4px 12px calc(10px + ${layout.safeBottom})`,
  overflowX: 'auto',
  overflowY: 'hidden',
  scrollbarWidth: 'none',
  touchAction: 'pan-x',
  selectors: {
    [split]: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))',
      alignContent: 'start',
      overflowX: 'hidden',
      overflowY: 'auto',
      touchAction: 'pan-y',
      borderRight: `1px solid ${vars.color.line}`,
    },
  },
});
globalStyle(`${drawer}::-webkit-scrollbar`, { display: 'none' });
globalStyle(`${tools}::-webkit-scrollbar`, { display: 'none' });

// ---------- the specimen drawer ----------
export const tile = style({
  flex: '0 0 auto',
  position: 'relative',
  width: 84,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 2,
  padding: '6px 4px 5px',
  borderRadius: vars.radius.row,
  border: `1px solid ${vars.color.line}`,
  background: vars.color.surface,
  cursor: 'grab',
  touchAction: 'pan-x',
  selectors: { [split]: { width: 'auto', touchAction: 'pan-y' }, '&:active': { background: rgba(fg, 0.12) } },
});
export const tileCanvas = style({ width: 64, height: 64, pointerEvents: 'none' });
export const tileLabel = style({
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: 11,
  letterSpacing: 0.5,
  color: vars.color.dim,
  pointerEvents: 'none',
});
/** a kept specimen goes by its genus, as the living things do: italic serif */
export const tileName = style({ fontFamily: layout.serif, fontStyle: 'italic', fontSize: 13, letterSpacing: 0, color: vars.color.text });
export const tileDel = style({
  position: 'absolute',
  top: 2,
  right: 2,
  width: 22,
  height: 22,
  padding: 0,
  border: 0,
  borderRadius: 11,
  background: 'transparent',
  color: vars.color.dim,
  fontSize: 12,
  cursor: 'pointer',
  selectors: { '&:hover': { color: vars.color.text, background: rgba(fg, 0.12) } },
});

// ---------- the bench (split view only): one specimen, the place to cross two ----------
export const bench = style({
  gridArea: 'bench',
  display: 'none',
  justifyContent: 'center',
  padding: '4px 12px 8px',
  selectors: { [split]: { display: 'flex', borderRight: `1px solid ${vars.color.line}` } },
});
export const benchFrame = style({
  position: 'relative',
  width: 'min(100%, 34vh)',
  aspectRatio: '1',
  borderRadius: '50%',
  overflow: 'hidden',
  border: `1px solid ${vars.color.line}`,
  background: 'radial-gradient(circle at 50% 40%, #0d3036, #03121a 75%)',
  boxShadow: `0 0 24px ${rgba(fg, 0.08)} inset`,
  cursor: 'grab',
});
export const benchCanvas = style({ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' });
/** while a specimen is dragged over a full bench: replace it (left) or cross the two (right) */
export const halves = style({
  position: 'absolute',
  inset: 0,
  display: 'none',
  pointerEvents: 'none',
  selectors: { '.target &': { display: 'flex' } },
});
export const half = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  fontSize: 11,
  letterSpacing: 1,
  color: vars.color.text,
  background: 'rgba(0,0,0,.45)',
  selectors: { '&.hot': { background: rgba(fg, 0.28), color: '#fff' }, '& + &': { borderLeft: `1px dashed ${rgba(fg, 0.5)}` } },
});
globalStyle(`${half} i`, { fontSize: 26 });

// ---------- dragging a specimen ----------
export const over = style({ outline: `2px dashed ${rgba(fg, 0.45)}`, outlineOffset: -6 });
const wiggle = keyframes({ from: { transform: 'rotate(-8deg)' }, to: { transform: 'rotate(8deg)' } });
export const ghost = style({
  position: 'fixed',
  left: 0,
  top: 0,
  width: 72,
  height: 72,
  margin: '-36px 0 0 -36px',
  zIndex: 80,
  pointerEvents: 'none',
  display: 'none',
  animation: `${wiggle} .35s ease-in-out infinite alternate`,
  selectors: { '&.on': { display: 'block' } },
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
});
