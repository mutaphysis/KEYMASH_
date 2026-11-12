// Save slots in localStorage (best-effort) + demo programs.

const KEY = 'keymash.slots.v1';
const DRAFT = 'keymash.draft.v1';

function read(k, def) { try { const v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } }
function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

export const store = {
  slots() { return read(KEY, []); },
  save(src) {
    const slots = this.slots();
    const first = (src.split('\n').find((l) => l.trim()) || 'mash').trim().slice(0, 22);
    slots.unshift({ name: first, src, t: Date.now() });
    const ok = write(KEY, slots.slice(0, 40));
    return ok ? slots.length : 0;
  },
  remove(i) { const s = this.slots(); s.splice(i, 1); write(KEY, s); },
  draft() { return read(DRAFT, null); },
  setDraft(src) { write(DRAFT, src); },
};

export const DEMOS = [
  { name: '🐶 dog on keyboard', src: 'jfkdlsöä asdfghjkl JJJJJJJJJ 🐶\nkkkkk  ddddd h h hhhh\nWOOF!!! ölkjhg 🐾🐾🐾 qqqqqqqq' },
  { name: '🥁 paw drum machine', src: 'd..h.dk.h.d..h.k.\nh h h h h h h hhhh\nb . . b . . b . b . . b . bb .\nqwertzuiop . poiuztrewq . asdf ~' },
  { name: '🧒 kid\'s first program', src: 'hallo ich bin 6 und kann programmieren!!!\n2+2= 7*6= 100-1=\nMAMA PAPA 🦄🌈🐶\nlalala ~~~ 🎵🎵' },
  { name: '💻 hack the planet', src: 'HACK THE PLANET ### 💻\n[asdf] & 3(qwer) {{{ ~~~\nsudo rm -rf / !!! 😎\n1337 * 42 = 🕶️ %' },
  { name: '📈 math mode', src: '3+4*2= 12/0= 2^10= 9^9^9=\n~~~ % ~ @@ 🧮 📈\n1 2 3 4 5 6 7 8 9 0' },
  { name: '🩰 paw ballet', src: '🐾 ölkjhgfdsa ~ asdfghjklö ~ 🐾\n{ yxcvbnm } { mnbvcxy } mmmm %\n...ooooooooooo... 🫧 ✨' },
  { name: '🌀 tunnel vision', src: 'eeeeeeee 🌀 rrrrrr\n@@@ %% ~~~~~~\n💫 zzzz ZZZZ zzzz !!!!' },
];

// a virtual paw: clusters of neighbouring keys, held keys, the odd caps lock and emoji
const ROWS = ['1234567890', 'qwertzuiopü', 'asdfghjklöä', 'yxcvbnm'];
export function pawMash(len = 60) {
  let s = '';
  const emoji = ['🐶', '🐾', '🦴', '🎾', '💥', '🔥', '🌈', '✨', '🐿️'];
  const syms = ['!', '?', '~', '.', '#', '*', '(', ')', '[', ']', '&', '%', '@', '-', ':'];
  while (s.length < len) {
    const r = Math.random();
    if (r < 0.62) {
      // a paw press: 2-7 keys around a centre
      const row = 1 + ((Math.random() * 3) | 0); const keys = ROWS[row];
      let col = (Math.random() * keys.length) | 0; const n = 2 + ((Math.random() * 6) | 0);
      const caps = Math.random() < 0.12;
      for (let i = 0; i < n; i++) {
        col = Math.max(0, Math.min(keys.length - 1, col + ((Math.random() * 3) | 0) - 1));
        let ch = keys[col];
        if (caps) ch = ch.toUpperCase();
        s += Math.random() < 0.18 ? ch.repeat(2 + ((Math.random() * 6) | 0)) : ch;
      }
    } else if (r < 0.72) s += syms[(Math.random() * syms.length) | 0].repeat(1 + ((Math.random() * 3) | 0));
    else if (r < 0.78) s += emoji[(Math.random() * emoji.length) | 0];
    else if (r < 0.84) s += String((Math.random() * 1000) | 0);
    else if (r < 0.9) s += '\n';
    s += Math.random() < 0.7 ? ' ' : '';
  }
  return s.replace(/\n{2,}/g, '\n').trim();
}
