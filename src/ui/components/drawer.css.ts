// The program drawer and what goes in it: rows, selects, headings; plus the toast.
import { globalStyle, style } from '@vanilla-extract/css';
import { vars, layout, rgba } from '../../styles/theme.css';

const fg = vars.rgb.fg;

// ---------- the sheet ----------
export const overlay = style({
  position: 'absolute', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 60, display: 'flex', alignItems: 'flex-end',
  selectors: { '&[hidden]': { display: 'none' } },
});
export const panel = style({
  width: '100%', maxHeight: '80%', overflowY: 'auto', background: vars.color.panel, borderTop: `1px solid ${rgba(fg, 1)}`,
  borderRadius: `${vars.radius.sheet} ${vars.radius.sheet} 0 0`, boxShadow: `0 -10px 40px ${rgba(fg, 0.22)}`,
  padding: `10px calc(12px + ${layout.safeRight}) calc(16px + ${layout.safeBottom}) calc(12px + ${layout.safeLeft})`,
});
export const head = style({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, color: rgba(fg, 1) });
export const heading = style({ margin: '14px 0 6px', fontWeight: 'normal', color: vars.color.dim, fontSize: 12, letterSpacing: 2 });
export const empty = style({ opacity: 0.5, fontSize: 13, padding: '6px 2px' });

// ---------- <km-item>: a two-line row, optionally with a delete button ----------
export const row = style({ display: 'flex', gap: 6, alignItems: 'stretch', marginBottom: 6 });
const button = style({
  minWidth: 0, cursor: 'pointer', borderRadius: vars.radius.row, background: vars.color.surface, color: vars.color.text,
  border: `1px solid ${vars.color.border}`, fontSize: 12, letterSpacing: 0.5, textShadow: vars.shadow.text, touchAction: 'manipulation',
});
export const name = style([button, { flex: 1, textAlign: 'left', padding: `8px max(10px, calc(${vars.radius.row} + 2px))`, whiteSpace: 'normal', overflow: 'hidden' }]);
export const sub = style({ display: 'block', color: rgba(fg, 0.5), fontSize: 11, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textShadow: 'none' });
export const del = style([button, { flex: '0 0 46px', color: rgba(vars.rgb.accent, 1), borderColor: rgba(vars.rgb.accent, 0.5) }]);
/** two things side by side, e.g. reload | language */
export const split = style({ display: 'flex', gap: 6, marginBottom: 6 });
globalStyle(`${split} > *`, { flex: '1 1 0', minWidth: 0, marginBottom: 0 });
globalStyle(`${split} ${sub}`, { whiteSpace: 'normal' });

// ---------- <km-select>: a native select dressed like the rows, the arrow drawn on top ----------
export const pick = style({
  position: 'relative', display: 'flex', marginBottom: 6,
  selectors: { '&::after': { content: '"▾"', position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: rgba(fg, 1), fontSize: 14 } },
});
export const select = style([button, {
  flex: 1, WebkitAppearance: 'none', appearance: 'none', textOverflow: 'ellipsis', padding: '8px 30px 8px 10px',
  selectors: { '&:focus-visible': { outline: `1px solid ${rgba(fg, 1)}`, outlineOffset: 2 } },
}]);
globalStyle(`${select} option`, { background: vars.color.panel, color: vars.color.text });

// ---------- <km-toast> ----------
export const toast = style({
  position: 'absolute', left: '50%', top: `calc(64px + ${layout.safeTop})`, transform: 'translateX(-50%)', zIndex: 70, background: '#000',
  border: `1px solid ${rgba(fg, 1)}`, padding: '10px 14px', borderRadius: vars.radius.row, boxShadow: `0 0 20px ${rgba(fg, 0.38)}`,
  fontSize: 14, whiteSpace: 'nowrap',
  selectors: { '&[hidden]': { display: 'none' } },
});
