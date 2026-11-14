// The KEYMASH_ cheat sheet: the most important things to type, each with a picture of what it does.
// `bun scripts/sheet.ts` runs every snippet and renders sheet/<id>.webp; README.md shows them too.
import type { Sheet, SheetCard } from '../types';
import { t } from './messages';
import type { KeymashMsg } from './messages';

const IMG = import.meta.glob<string>('./sheet/*.webp', { eager: true, query: '?url', import: 'default' });

const card = (id: string, code: string, name: KeymashMsg, at: number, zoom = 1.8): SheetCard => ({
  id,
  code,
  name: t(name),
  at,
  zoom,
  img: IMG[`./sheet/${id}.webp`],
});

export const SHEET: Sheet = {
  intro: t('sheetIntro'),
  cards: [
    card('roll', 'asdf poiu', 'sheetRoll', 1.4),
    card('held', 'jjjjjjjj', 'sheetHeld', 1.1),
    card('caps', 'WOOF WOOF!', 'sheetCaps', 1.2),
    card('spell', 'lkjhgfdsa', 'sheetSpell', 1.6),
    card('math', '7*6=', 'sheetMath', 1.2, 1.2),
    card('emoji', '🐶🔥🌈', 'sheetEmoji', 1.2),
    card('letters', 'c o s x', 'sheetLetters', 1.6),
    card('boom', '!!!', 'sheetBoom', 0.5, 1.2),
    card('spiral', '@@ ***', 'sheetSpiral', 1.2),
    card('glitch', 'asdf ###', 'sheetGlitch', 1.0, 1.2),
    card('kaleido', 'qwertz %', 'sheetKaleido', 1.6, 1.2),
    card('money', '$$$$', 'sheetMoney', 0.9),
  ],
};
