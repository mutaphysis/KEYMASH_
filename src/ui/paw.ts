// A virtual paw: clusters of neighbouring keys, held keys, the odd caps lock and emoji.
// Feeds the MASH button and an empty RUN in every mode.

const ROWS = ['1234567890', 'qwertzuiopü', 'asdfghjklöä', 'yxcvbnm'];
const EMOJI = ['🐶', '🐾', '🦴', '🎾', '💥', '🔥', '🌈', '✨', '🐿️'];
const SYMS = ['!', '?', '~', '.', '#', '*', '(', ')', '[', ']', '&', '%', '@', '-', ':'];

export function pawMash(len = 60): string {
  let s = '';
  while (s.length < len) {
    const r = Math.random();
    if (r < 0.62) {
      // a paw press: 2-7 keys around a centre
      const row = 1 + ((Math.random() * 3) | 0);
      const keys = ROWS[row]!;
      let col = (Math.random() * keys.length) | 0;
      const n = 2 + ((Math.random() * 6) | 0);
      const caps = Math.random() < 0.12;
      for (let i = 0; i < n; i++) {
        col = Math.max(0, Math.min(keys.length - 1, col + ((Math.random() * 3) | 0) - 1));
        let ch = keys[col]!;
        if (caps) ch = ch.toUpperCase();
        s += Math.random() < 0.18 ? ch.repeat(2 + ((Math.random() * 6) | 0)) : ch;
      }
    } else if (r < 0.72) s += SYMS[(Math.random() * SYMS.length) | 0]!.repeat(1 + ((Math.random() * 3) | 0));
    else if (r < 0.78) s += EMOJI[(Math.random() * EMOJI.length) | 0];
    else if (r < 0.84) s += String((Math.random() * 1000) | 0);
    else if (r < 0.9) s += '\n';
    s += Math.random() < 0.7 ? ' ' : '';
  }
  return s.replace(/\n{2,}/g, '\n').trim();
}
