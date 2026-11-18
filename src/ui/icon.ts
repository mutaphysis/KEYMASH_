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

/** a CSS cursor showing the icon in `color` with a dark outline, hotspot in the middle; `fallback` if it can't load */
export async function iconCursor(name: IconName, color: string, fallback = 'crosshair'): Promise<string> {
  try {
    // small SVGs may arrive inlined as data URLs with single quotes: match either
    const svg = (await (await fetch(ICONS[name])).text())
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/fill=(["'])currentColor\1/g, `fill="${color}" stroke="#000" stroke-width="2" stroke-linejoin="round" paint-order="stroke"`)
      .replace(/1em/g, '24');
    return `url("data:image/svg+xml,${encodeURIComponent(svg.trim())}") 12 12, ${fallback}`;
  } catch (e) {
    return fallback;
  }
}
