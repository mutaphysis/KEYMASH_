import type { Op } from './types';

// Keyboard geometry (German QWERTZ). Where a key sits decides where it lands
// on screen and which note it plays — so a paw smash paints the keyboard.

const ROWS = [
  { keys: '1234567890ß', off: 0.0 },
  { keys: 'qwertzuiopü', off: 0.5 },
  { keys: 'asdfghjklöä', off: 0.75 },
  { keys: 'yxcvbnm', off: 1.25 },
];
export interface KeyInfo {
  ch: string;
  row: number;
  col: number;
  x: number;
  y: number;
  deg: number;
}
const MAP = new Map<string, KeyInfo>();
ROWS.forEach((r, row) => {
  [...r.keys].forEach((ch, col) => {
    MAP.set(ch, {
      ch,
      row,
      col,
      x: (col + r.off + 0.5) / 12, // 0..1
      y: (row + 0.5) / 4, // 0..1
      // pentatonic degree: column = step, row = octave (top row highest)
      deg: col + (2 - row) * 5,
    });
  });
});
const ALL = [...MAP.values()].filter((k) => k.row > 0);

export function stripAccents(s: string): string {
  try {
    return s.normalize('NFD').replace(/\p{M}/gu, '');
  } catch (e) {
    return s;
  }
}

/** Key info for any grapheme. Unknown characters are folded onto a real key. */
export function keyInfo(g: string): KeyInfo {
  const lo = String(g).toLowerCase();
  const direct = MAP.get(lo);
  if (direct) return direct;
  const viaPlain = MAP.get(stripAccents(lo)[0] ?? '');
  if (viaPlain) return viaPlain;
  const cp = lo.codePointAt(0) || 0;
  return ALL[cp % ALL.length]!;
}

export function adjacent(a: KeyInfo, b: KeyInfo): boolean {
  return a.row === b.row && Math.abs(a.col - b.col) === 1;
}

// Emoji (single keys on a phone keyboard) with special powers. Everything else is stamped + sparkled.
export const EMOJI_POWERS: Record<string, Op> = {
  '🐶': 'dog',
  '🐕': 'dog',
  '🦮': 'dog',
  '🐩': 'dog',
  '🐾': 'paws',
  '🐱': 'cat',
  '🐈': 'cat',
  '😺': 'cat',
  '😸': 'cat',
  '🐮': 'cow',
  '🐄': 'cow',
  '🦆': 'duck',
  '🐷': 'pig',
  '🐖': 'pig',
  '🐦': 'bird',
  '🐤': 'bird',
  '🐟': 'fish',
  '🐠': 'fish',
  '🦖': 'dino',
  '🦕': 'dino',
  '🐉': 'dragon',
  '🐲': 'dragon',
  '🦄': 'unicorn',
  '👻': 'ghost',
  '👽': 'alien',
  '🛸': 'alien',
  '👾': 'alien',
  '🤖': 'robot',
  '🚀': 'rocket',
  '🎾': 'ball',
  '⚽': 'ball',
  '🏀': 'ball',
  '🦴': 'bone',
  '🐿️': 'squirrel',
  '🐿': 'squirrel',
  '💩': 'poop',
  '🍕': 'pizza',
  '🎂': 'cake',
  '🍌': 'banana',
  '🚗': 'car',
  '🏎️': 'car',
  '🚂': 'train',
  '💥': 'boom',
  '🔥': 'fire',
  '🌈': 'rainbow',
  '❤️': 'heart',
  '❤': 'heart',
  '💖': 'heart',
  '💕': 'heart',
  '😍': 'heart',
  '⭐': 'star',
  '🌟': 'stars',
  '✨': 'sparkle',
  '💫': 'sparkle',
  '🎵': 'arp',
  '🎶': 'arp',
  '🎹': 'chord',
  '🥁': 'drum',
  '🌧️': 'rain',
  '🌧': 'rain',
  '☔': 'rain',
  '❄️': 'snow',
  '❄': 'snow',
  '☃️': 'snow',
  '⛄': 'snow',
  '🎉': 'confetti',
  '🎊': 'confetti',
  '🎆': 'fireworks',
  '🎇': 'fireworks',
  '💸': 'money',
  '💰': 'money',
  '🤑': 'money',
  '🌀': 'tunnel',
  '🙃': 'flip',
  '🪞': 'mirror',
  '💻': 'hack',
  '🖥️': 'hack',
  '⌨️': 'hack',
  '🕶️': 'matrix',
  '😎': 'matrix',
  '☀️': 'sun',
  '🌞': 'sun',
  '🌙': 'moon',
  '🌕': 'moon',
  '🌳': 'tree',
  '🌲': 'tree',
  '🌸': 'flower',
  '🌻': 'flower',
  '🌷': 'flower',
  '🫧': 'bubbles',
  '💨': 'smoke',
  '⚡': 'zigzag',
  '🌊': 'wave',
  '🐛': 'glitch',
  '🦠': 'virus',
  '☠️': 'virus',
  '💀': 'spooky',
  '🔔': 'chime',
  '📢': 'siren',
  '🚨': 'siren',
  '🎲': 'random',
  '🤪': 'chaos',
  '🧮': 'math',
  '📈': 'math',
  '🐝': 'bee',
  '🐸': 'frog',
  '🦉': 'owl',
  '🐋': 'whale',
  '🐳': 'whale',
  '🐍': 'snake',
  '🪩': 'disco',
  '🕺': 'disco',
  '💃': 'disco',
  '☄️': 'meteor',
  '🌠': 'meteor',
  '🕳️': 'blackhole',
  '🌌': 'aurora',
  '🔭': 'constellation',
  '📡': 'radar',
  '🎺': 'fanfare',
  '💓': 'heartbeat',
  '💗': 'heartbeat',
  '🥧': 'pi',
  '🔺': 'sierpinski',
  '🐚': 'fibonacci',
  '🦋': 'lorenz',
};
