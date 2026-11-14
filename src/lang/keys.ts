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
