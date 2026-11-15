import { style } from '@vanilla-extract/css';

/** the SVG (var(--icon), a url()) as a mask over currentColor: the icon takes the text colour and size */
export const icon = style({
  display: 'inline-block',
  flex: 'none',
  width: '1em',
  height: '1em',
  verticalAlign: '-0.15em',
  fontStyle: 'normal',
  background: 'currentColor',
  maskImage: 'var(--icon)',
  maskSize: 'contain',
  maskRepeat: 'no-repeat',
  maskPosition: 'center',
  WebkitMaskImage: 'var(--icon)',
  WebkitMaskSize: 'contain',
  WebkitMaskRepeat: 'no-repeat',
  WebkitMaskPosition: 'center',
});
