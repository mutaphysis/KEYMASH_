// MYCELIUM_ text: status line, demos, cheat sheet, boot.
import { defineMessages } from '../../i18n';
import type { Translation } from '../../i18n';

const en = {
  tagline: 'the forest floor you type',
  emptyToast: 'BARE SOIL? A PAW SCRATCHED SOMETHING IN',
  runHint: 'look at the forest floor',
  ready: 'SOIL READY',
  lines: { one: 'LINE', other: 'LINES' },
  noGl: 'this browser has no WebGL2: the forest stays dark',
  bootLoad: 'soil: {pct}%',
  bootFailed: 'the soil did not arrive ({err}); RUN tries again',
  bootGround: 'forest floor: {m} m wide, humus {cm} cm deep',
  // ---- demo names ----
  demoHollow: '🌲 spruce hollow',
  demoHill: '⛰️ mossy hill',
  demoDog: '🐾 dog on the keyboard',
  // ---- cheat sheet ----
  sheetIntro: 'The text shapes the forest floor: the same text always gives the same ground. Drag to look around.',
};

// casual "du", short
const de: Translation<typeof en> = {
  tagline: 'der Waldboden, den du tippst',
  emptyToast: 'NACKTER BODEN? EINE PFOTE HAT GESCHARRT',
  runHint: 'Waldboden anschauen',
  ready: 'BODEN BEREIT',
  lines: { one: 'ZEILE', other: 'ZEILEN' },
  noGl: 'dieser Browser kann kein WebGL2: der Wald bleibt dunkel',
  bootLoad: 'Boden: {pct}%',
  bootFailed: 'der Boden kam nicht an ({err}); RUN versucht es nochmal',
  bootGround: 'Waldboden: {m} m breit, Humus {cm} cm tief',
  demoHollow: '🌲 Fichtensenke',
  demoHill: '⛰️ Mooshügel',
  demoDog: '🐾 Hund auf der Tastatur',
  sheetIntro: 'Der Text formt den Waldboden: derselbe Text, derselbe Boden. Zieh, um dich umzusehen.',
};

export const { t, tn } = defineMessages(en, de);
