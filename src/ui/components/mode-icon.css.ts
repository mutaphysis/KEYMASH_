import { style, globalStyle } from '@vanilla-extract/css';
import { vars, rgba } from '../../styles/theme.css';

export const icon = style({
  gridArea: 'icon',
  width: 44,
  height: 44,
  padding: 4,
  border: 0,
  borderRadius: 12,
  background: 'transparent',
  touchAction: 'manipulation',
  cursor: 'pointer',
  selectors: { '&:active': { transform: 'scale(.9)' } },
});
globalStyle(`${icon} svg`, { width: '100%', height: '100%', display: 'block', filter: `drop-shadow(0 0 6px ${rgba(vars.rgb.fg, 0.6)})` });
