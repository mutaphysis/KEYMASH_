// PETRI_'s lab: a full-app view. Phone: the dish on top, tools and the specimen drawer under it.
// Split view: a column on the left (bar, bench, tools, drawer), the dish on the right.
import { globalStyle, style } from '@vanilla-extract/css';
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
      gridTemplateColumns: 'minmax(300px, min(42%, 640px)) minmax(0, 1fr)',
      gridTemplateRows: 'auto auto auto minmax(0, 1fr)',
      gridTemplateAreas: '"top dish" "bench dish" "tools dish" "drawer dish"',
    },
  },
});

/** everything in the left column of the split view gets a border on its right */
const column = { [split]: { borderRight: `1px solid ${vars.color.line}` } };

export const top = style({
  gridArea: 'top',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: `calc(4px + ${layout.safeTop}) 12px 4px`,
  selectors: column,
});

export const title = style({
  flex: 1,
  fontFamily: layout.display,
  fontSize: 20,
  letterSpacing: 2,
  color: rgba(fg, 1),
  textShadow: `0 0 10px ${rgba(fg, 0.6)}`,
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
    [split]: {
      flexWrap: 'wrap',
      overflowX: 'visible',
      WebkitMaskImage: 'none',
      maskImage: 'none',
      borderRight: `1px solid ${vars.color.line}`,
    },
  },
});

export const divider = style({ flex: '0 0 1px', alignSelf: 'stretch', margin: '6px 2px', background: vars.color.line });

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
