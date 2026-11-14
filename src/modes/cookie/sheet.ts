// The COOKIE_ cheat sheet: what a recipe can ask for, each with a picture of the finished cookie.
// `bun scripts/sheet.ts` bakes every snippet and renders sheet/<id>.webp; README.md shows them too.
import type { Sheet, SheetCard } from '../types';
import { t } from './messages';
import type { CookieMsg } from './messages';

const IMG = import.meta.glob<string>('./sheet/*.webp', { eager: true, query: '?url', import: 'default' });

const card = (id: string, code: string, name: CookieMsg, zoom = 1.4): SheetCard => ({
  id,
  code,
  name: t(name),
  at: 30,
  zoom,
  img: IMG[`./sheet/${id}.webp`],
});

export const SHEET: Sheet = {
  intro: t('sheetIntro'),
  cards: [
    card('round', 'butter round plain 1', 'cardRound'),
    card('star', 'ginger ⭐ 3', 'cardStar', 1),
    card('heart', '❤️ !! pink 1', 'cardHeart'),
    card('tree', '🎄 matcha ! green *** 1', 'cardTree'),
    card('bear', '🐻 cocoa :) 1', 'cardBear'),
    card('bell', '🔔 🍫 °°° 1', 'cardBell'),
    card('chips', 'oat round plain .... 1', 'cardChips'),
    card('drips', 'round !!! blue 1', 'cardDrips'),
    card('stripes', 'round 🍫 = white 1', 'cardStripes'),
    card('sugar', 'round ! +++ ✨ 1', 'cardSugar'),
    card('letters', '[JOY] 3 ! red round', 'cardLetters', 1),
    card('burnt', 'round plain 250 30 2', 'cardBurnt', 1),
  ],
};
