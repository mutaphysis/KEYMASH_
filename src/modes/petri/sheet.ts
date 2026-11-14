// The PETRI_ cheat sheet: what a line grows into, each with a picture of the cell.
// `bun scripts/sheet.ts` grows every snippet and renders sheet/<id>.webp; README.md shows them too.
import type { Sheet, SheetCard } from '../types';
import { t } from './messages';
import type { PetriMsg } from './messages';

const IMG = import.meta.glob<string>('./sheet/*.webp', { eager: true, query: '?url', import: 'default' });

const card = (id: string, code: string, name: PetriMsg, at: number, zoom: number): SheetCard => ({
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
    card('amoeba', 'asdf jkl', 'amoeba', 6, 5),
    card('flagellate', 'qwert zuiop', 'flagellate', 6, 5),
    card('coccus', 'yxcv bnm', 'coccus', 16, 6),
    card('bacillus', 'lang_lang-ein', 'bacillus', 6, 7),
    card('spirillum', 'ss@ss', 'spirillum', 6, 8),
    card('diatom', '#%# 42 abc', 'diatom', 6, 5),
    card('ciliate', 'jjjj kkkk', 'ciliate', 6, 5),
    card('volvox', 'ooo (o)', 'volvox', 6, 4),
    card('hunter', 'HUNTER', 'hunter', 6, 4),
    card('glow', 'asdf* 🌿☀️', 'photo', 6, 4),
    card('quote', '"hello dish"', 'sheetQuote', 6, 1.6),
    card('feed', '🌿 ☀️ ~ 🫧', 'sheetFeed', 8, 1.5),
  ],
};
