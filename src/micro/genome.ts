// PETRI_ genome reader. Any text is a valid culture: every line is the genome of one species,
// and the same line is read slowly, token by token, as a feeder that seeds cells, food and weather.
import { lex } from '../lang/lexer';
import type { Token } from '../lang/lexer';
import { keyInfo, stripAccents } from '../lang/keys';
import { hash, mulberry32 } from '../lang/vm';

export type Body = 'amoeba' | 'bacillus' | 'coccus' | 'spirillum' | 'diatom' | 'ciliate' | 'flagellate' | 'volvox';
export type Diet = 'grazer' | 'hunter' | 'photo' | 'omni';
export const BODIES: Body[] = ['amoeba', 'bacillus', 'coccus', 'spirillum', 'diatom', 'ciliate', 'flagellate', 'volvox'];

export interface Species {
  /** stable identity: hash of the line text, so a live edit keeps unchanged species alive */
  seed: number;
  line: number;
  name: string;
  body: Body;
  diet: Diet;
  hue: number; hue2: number; sat: number;
  /** base radius in world units (the dish has radius 420) */
  size: number;
  speed: number; sense: number; agility: number;
  toxic: number; armor: number; glow: number; colony: number;
  symbiosis: boolean; spores: boolean;
  divideAt: number; life: number; mutation: number;
  wobble: number; organelles: number; cilia: boolean; flagella: number; lobes: number;
}

export type FoodKind = 'algae' | 'sugar' | 'crumb' | 'debris';
export type Act =
  | { k: 'spawn'; n: number; u: number; v: number }
  | { k: 'food'; n: number; u: number; v: number; kind: FoodKind }
  | { k: 'light'; u: number; v: number }
  | { k: 'current'; u: number; v: number; swirl: number; angle: number }
  | { k: 'burst'; u: number; v: number }
  | { k: 'garden'; u: number; v: number }
  | { k: 'toxin'; u: number; v: number }
  | { k: 'spores'; u: number; v: number; n: number }
  | { k: 'temp'; t: number }
  | { k: 'note'; text: string; u: number; v: number }
  | { k: 'bond' }
  | { k: 'rest' };

export interface Step { g0: number; g1: number; beats: number; act: Act }
export interface LineProgram { line: number; text: string; species: Species | null; steps: Step[]; hue: number }
export interface Culture { gs: string[]; lines: LineProgram[]; species: Species[] }

/** Soft, distinct bioluminescent hues: aqua, mint, lime, amber, coral, rose, lilac, sky. */
export const PALETTE = [174, 150, 96, 44, 16, 340, 276, 204];

const EMOJI: Record<string, (u: number, v: number) => Act> = {};
const em = (list: string, f: (u: number, v: number) => Act) => { for (const ch of Array.from(new Intl.Segmenter().segment(list), (s) => s.segment)) EMOJI[ch] = f; };
em('🌿🌱🍃🪴🌾🍀🌵', (u, v) => ({ k: 'garden', u, v }));
em('☀️🌞💡⭐🌟✨🔆', (u, v) => ({ k: 'light', u, v }));
em('💧🌊💦🌀', (u, v) => ({ k: 'current', u, v, swirl: 1, angle: 0 }));
em('🫧', (u, v) => ({ k: 'burst', u, v }));
em('🍄', (u, v) => ({ k: 'spores', u, v, n: 3 }));
em('🦠🧫🔬🧬', (u, v) => ({ k: 'spawn', n: 2, u, v }));
em('❄️🧊⛄☃️', () => ({ k: 'temp', t: 0.55 }));
em('🔥🌋♨️', () => ({ k: 'temp', t: 1.5 }));
em('☠️🧪💀☢️', (u, v) => ({ k: 'toxin', u, v }));
em('🍬🍭🍯🍩🍰🎂🍪🍕', (u, v) => ({ k: 'food', n: 3, u, v, kind: 'sugar' }));
em('💞💕❤️🤝💖', () => ({ k: 'bond' }));

const GENUS: Record<Body, string[]> = {
  amoeba: ['amoeba', 'ella', 'opus'], bacillus: ['bacter', 'obacillus', 'ella'], coccus: ['coccus', 'ococcus', 'osarcina'],
  spirillum: ['spira', 'ospirillum', 'onema'], diatom: ['odiscus', 'onema', 'ularia'], ciliate: ['ophrys', 'ostoma', 'idium'],
  flagellate: ['omonas', 'ella', 'ophyta'], volvox: ['ovolvox', 'osphaera', 'ochloris'],
};
const EPITHET = ['ensis', 'ii', 'ata', 'oides', 'ica', 'ana', 'ula', 'osa'];
const VOWELS = 'aeiou';

/** Make a pronounceable stem out of keysmash: collapse held keys, slip a vowel into long consonant runs. */
export function pronounce(raw: string, rnd: () => number, max = 6): string {
  const plain = stripAccents(raw.toLowerCase()).replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1');
  let out = '', run = 0;
  for (const ch of plain) {
    if (VOWELS.includes(ch) || ch === 'y') { out += ch; run = 0; } else {
      if (run >= 2) { out += VOWELS[Math.floor(rnd() * 5)]; run = 0; }
      out += ch; run++;
    }
    if (out.length >= max) break;
  }
  return out;
}

function speciesName(words: string[], body: Body, seed: number): string {
  const rnd = mulberry32(seed);
  let g = pronounce(words[0] ?? '', rnd) || 'xen';
  const gs = GENUS[body]; const suf = gs[seed % gs.length]!;
  if (g.length > 2 && VOWELS.includes(g[g.length - 1]!) && VOWELS.includes(suf[0]!)) g = g.slice(0, -1);
  let e = pronounce(words[1] ?? [...(words[0] ?? 'mash')].reverse().join(''), rnd, 5) || 'mash';
  const es = EPITHET[(seed >>> 3) % EPITHET.length]!;
  if (e.length > 2 && VOWELS.includes(e[e.length - 1]!) && VOWELS.includes(es[0]!)) e = e.slice(0, -1);
  return g[0]!.toUpperCase() + g.slice(1) + suf + ' ' + e + es;
}

interface Stats {
  letters: string[]; upper: number; vowels: number; rows: number[]; colSum: number; held: number;
  words: string[]; spaces: number; digits: number; sym: Map<string, number>; emoji: string[]; total: number;
}

function analyse(toks: Token[]): Stats {
  const st: Stats = { letters: [], upper: 0, vowels: 0, rows: [0, 0, 0, 0], colSum: 0, held: 0, words: [], spaces: 0, digits: 0, sym: new Map(), emoji: [], total: 0 };
  for (const t of toks) {
    if (t.t === 'word') {
      st.words.push(t.text);
      let prev = '';
      for (const L of t.letters) {
        const lo = L.ch.toLowerCase();
        st.letters.push(lo); st.total++;
        if (L.ch !== lo) st.upper++;
        if (VOWELS.includes(stripAccents(lo))) st.vowels++;
        const k = keyInfo(lo); st.rows[k.row]!++; st.colSum += k.col;
        if (lo === prev) st.held++;
        prev = lo;
      }
    } else if (t.t === 'space') { st.spaces += t.n; st.total += t.n; }
    else if (t.t === 'num' || t.t === 'math') { st.digits += t.t === 'num' ? t.text.length : 3; st.total += t.g1 - t.g0; }
    else if (t.t === 'sym') { st.sym.set(t.ch, (st.sym.get(t.ch) ?? 0) + t.n); st.total += t.n; }
    else if (t.t === 'emoji') { for (let i = 0; i < t.n; i++) st.emoji.push(t.ch); st.total += t.n; }
    else if (t.t === 'quote') { st.total += t.text.length; }
  }
  return st;
}

const SIZE: Record<Body, number> = { amoeba: 1.55, bacillus: 0.75, coccus: 0.6, spirillum: 0.75, diatom: 1.1, ciliate: 1.3, flagellate: 0.9, volvox: 1.7 };
const SPEED: Record<Body, number> = { amoeba: 11, bacillus: 42, coccus: 7, spirillum: 58, diatom: 9, ciliate: 34, flagellate: 40, volvox: 12 };

function genome(text: string, toks: Token[], line: number, usedHues: Set<number>): Species | null {
  const st = analyse(toks);
  const has = (ch: string) => st.sym.get(ch) ?? 0;
  const cellEmoji = st.emoji.some((e) => EMOJI[e]?.(0, 0).k === 'spawn');
  if (!st.letters.length && !cellEmoji) return null; // pure environment line: no species, only weather and food
  const seed = hash(text.trim() || 'blank');
  const rnd = mulberry32(seed);
  const n = Math.max(1, st.letters.length);
  const rowShare = st.rows.map((r) => r / n);
  const avgLen = st.words.length ? st.letters.length / st.words.length : 4;
  const upShare = st.upper / n;

  // body: every trait votes, a little noise breaks ties
  const score: Record<Body, number> = {
    amoeba: rowShare[2]! * 3 + (avgLen > 7 ? 0.8 : 0),
    flagellate: rowShare[1]! * 3 + has('~') * 2,
    coccus: rowShare[3]! * 3 + has('.') * 0.6 + has('o') + has('°') * 2,
    bacillus: has('-') + has('_') * 2 + has('|') * 1.5 + (avgLen >= 6 ? 1.2 : 0),
    spirillum: has('@') * 3 + (st.letters.filter((l) => l === 's').length / n) * 5 + has('§') * 3,
    diatom: has('#') * 3 + has('%') * 2 + (st.digits / Math.max(1, st.total)) * 3,
    ciliate: (st.held / n) * 6 + has('=') * 2 + has('"') * 1.5,
    volvox: (has('(') + has(')')) * 1.2 + (st.letters.filter((l) => l === 'o').length / n) * 4,
  };
  for (const b of BODIES) score[b] += rnd() * 1.1;
  if (st.emoji.includes('🧫')) score.volvox += 3;
  if (st.emoji.includes('🌀')) score.spirillum += 3;
  const body = BODIES.reduce((a, b) => (score[b] > score[a] ? b : a), BODIES[0]!);

  let diet: Diet = 'grazer';
  if (upShare > 0.34 || has('>') > 1) diet = 'hunter';
  else if (upShare > 0.12) diet = 'omni';
  else if (has('*') || st.emoji.some((e) => EMOJI[e]?.(0, 0).k === 'light' || EMOJI[e]?.(0, 0).k === 'garden') || body === 'diatom' || body === 'volvox') diet = 'photo';

  // colour from where the paw was on the keyboard, kept distinct from the other species
  let hi = Math.round((st.colSum / n) / 11 * 7) % PALETTE.length;
  for (let k = 0; k < PALETTE.length && usedHues.has(hi); k++) hi = (hi + 3) % PALETTE.length;
  usedHues.add(hi);
  const hue = (PALETTE[hi]! + (rnd() - 0.5) * 14 + 360) % 360;

  const vowelShare = st.vowels / n;
  let size = (11 + vowelShare * 12 + Math.min(10, avgLen) * 0.9) * SIZE[body] * (diet === 'hunter' ? 1.3 : 1);
  size = Math.max(6, Math.min(36, size));
  const calm = st.spaces / Math.max(1, st.total);
  const speed = SPEED[body] * (1 + (st.held / n) * 0.8 + has('!') * 0.08) * (1 - Math.min(0.5, calm * 0.8)) * (diet === 'hunter' ? 1.15 : 1);
  const plus = Math.min(3, has('+'));

  return {
    seed, line, body, diet, name: speciesName(st.words, body, seed),
    hue, hue2: (hue + 40 + rnd() * 60) % 360, sat: 55 + rnd() * 35,
    size, speed, sense: 70 + size * 4 * (diet === 'hunter' ? 1.5 : 1), agility: body === 'amoeba' || body === 'volvox' ? 1.2 : 2.6,
    toxic: Math.min(1, has('!') * 0.25 + (st.emoji.includes('☠️') ? 0.5 : 0)),
    armor: Math.min(0.9, (body === 'diatom' ? 0.6 : 0) + has('#') * 0.15),
    glow: Math.min(1, has('*') * 0.3 + (diet === 'photo' ? 0.25 : 0.08) + (st.emoji.some((e) => e === '✨' || e === '💡') ? 0.4 : 0)),
    colony: Math.min(1, (body === 'coccus' ? 0.75 : body === 'volvox' ? 0.5 : 0.05) + has('(') * 0.1),
    symbiosis: has('&') > 0 || st.emoji.some((e) => EMOJI[e]?.(0, 0).k === 'bond'),
    spores: has('.') >= 3 || st.emoji.includes('🍄'),
    divideAt: 90 * Math.pow(size / 14, 1.1) * (1 - plus * 0.15),
    life: 70 + rnd() * 70,
    mutation: Math.min(0.5, 0.04 + has('?') * 0.08),
    wobble: body === 'amoeba' ? 1 : 0.25 + rnd() * 0.2,
    organelles: 2 + (seed % 5),
    cilia: body === 'ciliate',
    flagella: body === 'flagellate' ? 1 + Math.min(2, has('~')) : body === 'spirillum' ? 2 : body === 'bacillus' && seed % 3 === 0 ? 1 : 0,
    lobes: 3 + (seed % 3),
  };
}

function uv(gs: string[], tok: Token, salt: number): [number, number] {
  const k = keyInfo(gs[tok.g0] ?? 'a');
  const j = mulberry32(hash(String(tok.g0)) ^ salt);
  return [Math.min(1, Math.max(0, k.x + (j() - 0.5) * 0.08)), Math.min(1, Math.max(0, k.y + (j() - 0.5) * 0.1))];
}

function steps(gs: string[], toks: Token[], sp: Species | null, line: number): Step[] {
  const out: Step[] = [];
  const add = (t: Token, act: Act, beats = 1) => out.push({ g0: t.g0, g1: t.g1, beats, act });
  for (const t of toks) {
    const [u, v] = uv(gs, t, line);
    switch (t.t) {
      case 'space': if (t.n >= 3) add(t, { k: 'rest' }); break;
      case 'word': {
        const len = t.letters.length;
        add(t, sp ? { k: 'spawn', n: Math.min(3, 1 + Math.floor(len / 6)), u, v } : { k: 'food', n: 2, u, v, kind: 'crumb' }, len >= 6 ? 2 : 1);
        break;
      }
      case 'num': add(t, { k: 'food', n: Math.max(1, Math.min(7, Math.round(Math.abs(t.value)) % 8)), u, v, kind: 'algae' }); break;
      case 'math': {
        const val = Number.isFinite(t.value) ? t.value : 0;
        add(t, { k: 'note', text: `${t.text} = ${Number.isFinite(t.value) ? Number(t.value.toPrecision(6)) : '∞'}`, u, v });
        out.push({ g0: t.g0, g1: t.g1, beats: 1, act: { k: 'food', n: 2 + (Math.round(Math.abs(val)) % 6), u, v, kind: 'algae' } });
        break;
      }
      case 'quote': add(t, { k: 'note', text: t.text || '…', u, v }, 2); break;
      case 'emoji': {
        const f = EMOJI[t.ch] ?? EMOJI[t.ch.replace(/️/g, '')];
        const act: Act = f ? f(u, v) : { k: 'food', n: 3, u, v, kind: 'crumb' };
        if (act.k === 'spawn' && !sp) add(t, { k: 'food', n: 4, u, v, kind: 'algae' });
        else add(t, act, t.n > 1 ? 2 : 1);
        break;
      }
      case 'sym': {
        const ch = t.ch;
        let act: Act = { k: 'rest' };
        if (ch === '.') act = { k: 'food', n: t.n, u, v, kind: 'crumb' };
        else if (ch === '~') act = { k: 'current', u, v, swirl: 1, angle: 0 };
        else if (ch === '-' || ch === '_' || ch === '—') act = { k: 'current', u, v, swirl: 0, angle: 0 };
        else if (ch === '/' || ch === '\\') act = { k: 'current', u, v, swirl: 0, angle: ch === '/' ? -0.8 : 0.8 };
        else if (ch === '*') act = { k: 'light', u, v };
        else if (ch === '!') act = { k: 'burst', u, v };
        else if (ch === '#' || ch === '%') act = { k: 'food', n: 3 * t.n, u, v, kind: 'debris' };
        else if (ch === '+') act = { k: 'food', n: 2 + t.n, u, v, kind: 'algae' };
        else if (ch === '&') act = { k: 'bond' };
        else if (ch === '@') act = { k: 'current', u, v, swirl: -1, angle: 0 };
        else if (ch === '?') {
          const pool: Act[] = [{ k: 'light', u, v }, { k: 'burst', u, v }, { k: 'food', n: 4, u, v, kind: 'algae' }, { k: 'current', u, v, swirl: 1, angle: 0 }];
          act = pool[hash(String(t.g0)) % pool.length]!;
        }
        add(t, act, ch === ',' || ch === '…' ? 1 : 1);
        break;
      }
    }
  }
  if (!out.length) out.push({ g0: 0, g1: 0, beats: 2, act: { k: 'rest' } });
  return out;
}

export function readCulture(src: unknown, keep: Species[] = []): Culture {
  const L = lex(src);
  const lines: LineProgram[] = [];
  const species: Species[] = [];
  const used = new Set<number>();
  const old = new Map(keep.map((s) => [s.seed, s]));
  L.lines.forEach((toks, i) => {
    const real = toks.filter((t) => t.t !== 'space');
    if (!real.length) return;
    const text = L.gs.slice(real[0]!.g0, real[real.length - 1]!.g1).join('');
    let sp = genome(text, toks, i, used);
    if (sp) {
      const prev = old.get(sp.seed);
      if (prev) { prev.line = i; sp = prev; } // same genome: the living population keeps its species
      species.push(sp);
    }
    lines.push({ line: i, text, species: sp, steps: steps(L.gs, toks, sp, i), hue: sp ? sp.hue : 190 });
  });
  return { gs: L.gs, lines, species };
}
