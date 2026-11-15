// UI icons: SVG files in src/ui/icons/ (fetched by `bun scripts/ui-icons.ts`), drawn as a CSS mask so
// they take the colour and font size of the text around them. Buttons and messages use these, never emoji.
import { ICONS } from './icons';
import type { IconName } from './icons';
import { icon as iconCls } from './icon.css';

export type { IconName };

/** a new <i> showing the icon */
export function iconEl(name: IconName): HTMLElement {
  const i = document.createElement('i');
  setIcon(i, name);
  return i;
}

/** turns `el` into the icon `name` */
export function setIcon(el: HTMLElement, name: IconName): void {
  el.classList.add(iconCls);
  el.style.setProperty('--icon', `url("${ICONS[name]}")`);
  el.setAttribute('aria-hidden', 'true');
}
