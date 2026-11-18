// The genome viewer: a panel over the lab, the rest dimmed.
import { globalStyle, style } from '@vanilla-extract/css';
import { vars, layout, rgba } from '../../../styles/theme.css';

const fg = vars.rgb.fg;

export const overlay = style({
  position: 'absolute',
  inset: 0,
  zIndex: 50,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: `calc(12px + ${layout.safeTop}) 12px calc(12px + ${layout.safeBottom})`,
  background: 'rgba(0,4,6,.62)',
  selectors: { '&[hidden]': { display: 'none' } },
});

export const panel = style({
  width: 'min(420px, 100%)',
  maxHeight: '100%',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 10,
  padding: 14,
  borderRadius: vars.radius.sheet,
  border: `1px solid ${vars.color.border}`,
  background: vars.color.panel,
  boxShadow: `0 0 40px ${rgba(fg, 0.12)}`,
});

export const name = style({
  // one line, whatever the edits make of it: the panel keeps its height
  maxWidth: '100%',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
  fontFamily: layout.serif,
  fontStyle: 'italic',
  fontSize: 22,
  textAlign: 'center',
  cursor: 'copy',
  borderRadius: 6,
  padding: '0 6px',
  selectors: { '&:hover, &:focus-visible': { background: rgba(fg, 0.08), outline: 'none' } },
});

export const helix = style({ width: '100%', height: 120, touchAction: 'manipulation', cursor: 'pointer' });

/** the gene pointed at; its line keeps its height when nothing is pointed at */
export const caption = style({
  height: 40,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  letterSpacing: 0.5,
  color: vars.color.text,
});

/** a gene's value as its icon: dim whole, lit from the bottom up as far as the gene goes (the lit one is clipped inline) */
export const gauge = style({ position: 'relative', flex: 'none', width: 36, height: 36, fontSize: 36 });
globalStyle(`${gauge} > i`, { position: 'absolute', inset: 0 });
export const gaugeBack = style({ opacity: 0.25 });
/** none or off: struck through, with a gap cut along the stroke (as the auto feed's off icon) */
export const struck = style({});
const gap = 'linear-gradient(45deg, #000 calc(50% - 4.5px), transparent calc(50% - 4.5px) calc(50% + 4.5px), #000 calc(50% + 4.5px))';
globalStyle(`${struck} > i`, {
  maskImage: `${gap}, var(--icon)`,
  maskComposite: 'intersect',
  WebkitMaskImage: `${gap}, var(--icon)`,
  WebkitMaskComposite: 'source-in',
});
globalStyle(`${struck}::after`, {
  content: '""',
  position: 'absolute',
  left: '50%',
  top: '50%',
  width: 44,
  height: 3,
  margin: '-1.5px 0 0 -22px',
  borderRadius: 1.5,
  background: 'currentColor',
  transform: 'rotate(45deg)',
});

/** the preview in the middle, the abilities stacked in its top left corner */
export const stage = style({ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' });
export const preview = style({ width: 150, height: 150 });

export const abilities = style({
  position: 'absolute',
  left: 0,
  top: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 6,
  pointerEvents: 'none',
});
export const ability = style({ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, letterSpacing: 0.5, color: vars.color.dim });
globalStyle(`${ability} i`, { fontSize: 18, color: vars.color.text });

export const stats = style({ width: '100%', display: 'grid', gridTemplateColumns: 'auto 1fr', alignItems: 'center', gap: '6px 8px' });
export const statIcon = style({ fontSize: 16, color: vars.color.dim });
export const bar = style({ height: 6, borderRadius: 3, background: rgba(fg, 0.12), overflow: 'hidden' });
export const fill = style({ height: '100%', borderRadius: 3, background: rgba(fg, 0.75), transition: 'width .3s' });

export const buttons = style({
  display: 'flex',
  gap: 10,
  width: '100%',
  justifyContent: 'center',
  // hidden until a gene changed, its room kept: nothing jumps when they come
  selectors: { '&[hidden]': { display: 'flex', visibility: 'hidden' } },
});
