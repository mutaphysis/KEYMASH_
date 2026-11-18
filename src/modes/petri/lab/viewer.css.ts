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

export const caption = style({
  minHeight: 18,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  letterSpacing: 0.5,
  color: vars.color.text,
});
export const dot = style({ width: 12, height: 12, borderRadius: 6, display: 'inline-block' });

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
  selectors: { '&[hidden]': { display: 'none' } },
});
