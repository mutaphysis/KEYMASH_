import { lang, t } from '../i18n';
import type { Msg } from '../i18n';

/** Typed getElementById that fails loudly if the markup and the code disagree. */
export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing from index.html`);
  return el as T;
}

export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const x = c.getContext('2d');
  if (!x) throw new Error('canvas 2d not available');
  return x;
}

const I18N_ATTRS = ['title', 'aria-label', 'placeholder'] as const;

/** Translate the markup: `data-i18n` sets the text, `data-i18n-title` etc. set that attribute. */
export function localize(root: ParentNode = document): void {
  document.documentElement.lang = lang;
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) el.textContent = t(el.dataset.i18n as Msg);
  for (const a of I18N_ATTRS) {
    for (const el of root.querySelectorAll(`[data-i18n-${a}]`)) el.setAttribute(a, t(el.getAttribute(`data-i18n-${a}`) as Msg));
  }
}
