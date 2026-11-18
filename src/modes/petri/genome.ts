// PETRI_ genome reader. Any text is a valid culture: every line is the genome of one species,
// and the same line is read slowly, token by token, as a feeder that seeds cells, food and weather.
// A genome is a sequence of genes (GENES), written as bases A C G T; every trait of a species is expressed from it.
import { lex } from '../../lang/lexer';
import type { Token } from '../../lang/lexer';
import { keyInfo, stripAccents } from '../../lang/keys';
import { hash, mulberry32 } from '../../lang/rng';

export type Body = 'amoeba' | 'bacillus' | 'coccus' | 'spirillum' | 'diatom' | 'ciliate' | 'flagellate' | 'volvox';
export type Diet = 'grazer' | 'hunter' | 'photo' | 'omni';
export const BODIES: Body[] = ['amoeba', 'bacillus', 'coccus', 'spirillum', 'diatom', 'ciliate', 'flagellate', 'volvox'];
export const DIETS: Diet[] = ['grazer', 'hunter', 'photo', 'omni'];

export interface Species {
  /** stable identity: hash of the line text, so a live edit keeps unchanged species alive */
  seed: number;
  line: number;
  name: string;
  body: Body;
  diet: Diet;
  hue: number;
  hue2: number;
  sat: number;
  /** base radius in world units (the dish has radius 420) */
  size: number;
  speed: number;
  sense: number;
  agility: number;
  toxic: number;
  armor: number;
  glow: number;
  colony: number;
  symbiosis: boolean;
  spores: boolean;
  divideAt: number;
  life: number;
  mutation: number;
  wobble: number;
  organelles: number;
  cilia: boolean;
  flagella: number;
  lobes: number;
  /** a hybrid (see hybrid.ts): the eater's species and the one whose genes it took up; null for a line's own species */
  parents: [Species, Species] | null;
  /** a drifted genome that still counts as this species (SPECIATION 'drift' in sim.ts); null for a species itself */
  variantOf: Species | null;
  /** the genes; every other trait is expressed from them */
  genome: Genome;
}

export type GeneId =
  | 'body'
  | 'size'
  | 'lobes'
  | 'wobble'
  | 'organelles'
  | 'flagella'
  | 'speed'
  | 'diet'
  | 'fertility'
  | 'life'
  | 'mutation'
  | 'toxic'
  | 'armor'
  | 'colony'
  | 'symbiosis'
  | 'spores'
  | 'hue'
  | 'hue2'
  | 'sat'
  | 'glow';
export type GeneGroup = 'form' | 'motion' | 'food' | 'defence' | 'social' | 'colour';
/** level: ordered values, a meal moves part of the way; circle: wraps (colours); switch: taken over whole */
export interface GeneDef {
  id: GeneId;
  group: GeneGroup;
  kind: 'level' | 'circle' | 'switch';
  states: number;
  fallback: number;
  /** how many bases the gene takes in the sequence */
  bases: number;
}
/** one state per GENES entry */
export type Genome = number[];

const gene = (id: GeneId, group: GeneGroup, kind: GeneDef['kind'], states: number, fallback: number): GeneDef => ({
  id,
  group,
  kind,
  states,
  fallback,
  bases: Math.max(1, Math.ceil(Math.log(states) / Math.log(4))),
});
/** The sequence order. New genes only ever go at the end: older sequences then still read the same. */
export const GENES: readonly GeneDef[] = [
  gene('body', 'form', 'switch', 8, 0),
  gene('size', 'form', 'level', 8, 3),
  gene('lobes', 'form', 'level', 4, 1),
  gene('wobble', 'form', 'level', 4, 1),
  gene('organelles', 'form', 'level', 8, 2),
  gene('flagella', 'form', 'level', 4, 0),
  gene('speed', 'motion', 'level', 8, 3),
  gene('diet', 'food', 'switch', 4, 0),
  gene('fertility', 'food', 'level', 4, 0),
  gene('life', 'food', 'level', 8, 3),
  gene('mutation', 'food', 'level', 4, 0),
  gene('toxic', 'defence', 'level', 4, 0),
  gene('armor', 'defence', 'level', 4, 0),
  gene('colony', 'social', 'level', 4, 0),
  gene('symbiosis', 'social', 'switch', 2, 0),
  gene('spores', 'social', 'switch', 2, 0),
  gene('hue', 'colour', 'circle', 32, 15),
  gene('hue2', 'colour', 'circle', 32, 21),
  gene('sat', 'colour', 'level', 4, 2),
  gene('glow', 'colour', 'level', 4, 0),
];
export const GENE_INDEX = Object.fromEntries(GENES.map((d, i) => [d.id, i])) as Record<GeneId, number>;
/** what each state of a level gene stands for (size before the body's and diet's factors, speed a factor on the body's) */
export const LEVELS: Partial<Record<GeneId, readonly number[]>> = {
  size: [11, 14, 17, 20, 23, 26, 29, 32],
  lobes: [2, 3, 4, 5],
  wobble: [0.25, 0.4, 0.7, 1],
  organelles: [1, 2, 3, 4, 5, 6, 7, 8],
  flagella: [0, 1, 2, 3],
  speed: [0.5, 0.65, 0.8, 1, 1.2, 1.4, 1.7, 2],
  fertility: [0, 1, 2, 3],
  life: [70, 80, 90, 100, 110, 120, 130, 140],
  mutation: [0.04, 0.12, 0.24, 0.5],
  toxic: [0, 0.25, 0.5, 1],
  armor: [0, 0.3, 0.6, 0.9],
  colony: [0.05, 0.5, 0.75, 1],
  sat: [55, 65, 75, 85],
  glow: [0.08, 0.25, 0.55, 1],
};
/** a colour gene's step in degrees */
export const HUE_STEP = 360 / 32;
export const levelOf = (id: GeneId, state: number): number => LEVELS[id]?.[state] ?? state;
/** the state whose level is closest to a value (the first wins a tie) */
export function nearest(id: GeneId, value: number): number {
  const ls = LEVELS[id] ?? [];
  let best = 0;
  for (let i = 1; i < ls.length; i++) if (Math.abs(ls[i]! - value) < Math.abs(ls[best]! - value)) best = i;
  return best;
}

const BASES = 'ACGT';
/** the genome as bases, each gene its `bases` digits in base 4, most significant first */
export function encodeGenome(g: Genome): string {
  let s = '';
  GENES.forEach((d, i) => {
    const v = g[i] ?? d.fallback;
    for (let k = d.bases - 1; k >= 0; k--) s += BASES[Math.floor(v / 4 ** k) % 4];
  });
  return s;
}
/** any text reads as a genome: only A C G T count; genes past the end get their fallback, extra bases are ignored */
export function decodeGenome(seq: string): Genome {
  const ds = Array.from(seq.toUpperCase(), (ch) => BASES.indexOf(ch)).filter((v) => v >= 0);
  let at = 0;
  return GENES.map((d) => {
    if (at + d.bases > ds.length) {
      at = ds.length;
      return d.fallback;
    }
    let v = 0;
    for (let k = 0; k < d.bases; k++) v = v * 4 + ds[at++]!;
    return v % d.states;
  });
}

/** the species a genome counts as: census, kin, extinction go by this */
export const kindOf = (sp: Species): Species => sp.variantOf ?? sp;

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

export interface Step {
  g0: number;
  g1: number;
  beats: number;
  act: Act;
}
export interface LineProgram {
  line: number;
  text: string;
  species: Species | null;
  steps: Step[];
  hue: number;
}
export interface Culture {
  gs: string[];
  lines: LineProgram[];
  species: Species[];
}

/** Soft, distinct bioluminescent hues: aqua, mint, lime, amber, coral, rose, lilac, sky. */
export const PALETTE = [174, 150, 96, 44, 16, 340, 276, 204];

const EMOJI: Record<string, (u: number, v: number) => Act> = {};
const em = (list: string, f: (u: number, v: number) => Act) => {
  for (const ch of Array.from(new Intl.Segmenter().segment(list), (s) => s.segment)) EMOJI[ch] = f;
};
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
  amoeba: ['amoeba', 'ella', 'opus'],
  bacillus: ['bacter', 'obacillus', 'ella'],
  coccus: ['coccus', 'ococcus', 'osarcina'],
  spirillum: ['spira', 'ospirillum', 'onema'],
  diatom: ['odiscus', 'onema', 'ularia'],
  ciliate: ['ophrys', 'ostoma', 'idium'],
  flagellate: ['omonas', 'ella', 'ophyta'],
  volvox: ['ovolvox', 'osphaera', 'ochloris'],
};
const EPITHET = ['ensis', 'ii', 'ata', 'oides', 'ica', 'ana', 'ula', 'osa'];
const VOWELS = 'aeiou';
const ONSET = ['b', 'c', 'd', 'f', 'g', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'z', 'ch', 'ph', 'th'];
const NUCLEUS = ['a', 'e', 'i', 'o', 'u', 'y'];

/** A binomial name from the genes alone: the same genome is always called the same, wherever it came from.
 *  The epithet says the most striking trait, when there is one. */
export function nameOf(g: Genome): string {
  const h = hash(encodeGenome(g));
  const at = (id: GeneId) => levelOf(id, g[GENE_INDEX[id]] ?? 0);
  const body = BODIES[g[GENE_INDEX.body]!] ?? 'amoeba';
  const diet = DIETS[g[GENE_INDEX.diet]!] ?? 'grazer';
  const genus = ONSET[h % 18]! + NUCLEUS[(h >>> 5) % 6]! + ONSET[(h >>> 8) % 18]! + GENUS[body][(h >>> 12) % 3]!;
  let ep: string;
  if (diet === 'hunter') ep = 'vorax';
  else if (at('toxic') >= 0.5) ep = 'toxica';
  else if (at('armor') >= 0.6) ep = 'armata';
  else if (at('glow') >= 0.55) ep = 'lucens';
  else if (g[GENE_INDEX.spores]) ep = 'sporifera';
  else if (g[GENE_INDEX.symbiosis]) ep = 'socialis';
  else if (at('colony') >= 0.75) ep = 'gregaria';
  else if (diet === 'photo') ep = 'viridis';
  else if (diet === 'omni') ep = 'omnivora';
  else {
    const end = EPITHET[(h >>> 24) % 8]!;
    ep = ONSET[(h >>> 16) % 18]! + (VOWELS.includes(end[0]!) ? '' : NUCLEUS[(h >>> 21) % 6]!) + end;
  }
  return genus[0]!.toUpperCase() + genus.slice(1) + ' ' + ep;
}

interface Stats {
  letters: string[];
  upper: number;
  vowels: number;
  rows: number[];
  colSum: number;
  held: number;
  words: string[];
  spaces: number;
  digits: number;
  sym: Map<string, number>;
  emoji: string[];
  total: number;
}

function analyse(toks: Token[]): Stats {
  const st: Stats = {
    letters: [],
    upper: 0,
    vowels: 0,
    rows: [0, 0, 0, 0],
    colSum: 0,
    held: 0,
    words: [],
    spaces: 0,
    digits: 0,
    sym: new Map(),
    emoji: [],
    total: 0,
  };
  for (const t of toks) {
    if (t.t === 'word') {
      st.words.push(t.text);
      let prev = '';
      for (const L of t.letters) {
        const lo = L.ch.toLowerCase();
        st.letters.push(lo);
        st.total++;
        if (L.ch !== lo) st.upper++;
        if (VOWELS.includes(stripAccents(lo))) st.vowels++;
        const k = keyInfo(lo);
        st.rows[k.row]!++;
        st.colSum += k.col;
        if (lo === prev) st.held++;
        prev = lo;
      }
    } else if (t.t === 'space') {
      st.spaces += t.n;
      st.total += t.n;
    } else if (t.t === 'num' || t.t === 'math') {
      st.digits += t.t === 'num' ? t.text.length : 3;
      st.total += t.g1 - t.g0;
    } else if (t.t === 'sym') {
      st.sym.set(t.ch, (st.sym.get(t.ch) ?? 0) + t.n);
      st.total += t.n;
    } else if (t.t === 'emoji') {
      for (let i = 0; i < t.n; i++) st.emoji.push(t.ch);
      st.total += t.n;
    } else if (t.t === 'quote') {
      st.total += t.g1 - t.g0; // glyphs, quote marks included (text.length would count an emoji twice)
    }
  }
  return st;
}

/** a body's size against the size gene; bacteria are the small ones, but still big enough to make out in the dish */
const SIZE: Record<Body, number> = {
  amoeba: 1.55,
  bacillus: 1.1,
  coccus: 0.9,
  spirillum: 1.0,
  diatom: 1.1,
  ciliate: 1.3,
  flagellate: 0.9,
  volvox: 1.7,
};
const SPEED: Record<Body, number> = {
  amoeba: 11,
  bacillus: 42,
  coccus: 7,
  spirillum: 58,
  diatom: 9,
  ciliate: 34,
  flagellate: 40,
  volvox: 12,
};

/** a line's genome: how it was typed, each trait rounded to the nearest state of its gene; null for a line without a species */
function readGenome(text: string, toks: Token[], usedHues: Set<number>): Genome | null {
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
  else if (
    has('*') ||
    st.emoji.some((e) => EMOJI[e]?.(0, 0).k === 'light' || EMOJI[e]?.(0, 0).k === 'garden') ||
    body === 'diatom' ||
    body === 'volvox'
  )
    diet = 'photo';

  // colour from where the paw was on the keyboard, kept distinct from the other species
  let hi = Math.round((st.colSum / n / 11) * 7) % PALETTE.length;
  for (let k = 0; k < PALETTE.length && usedHues.has(hi); k++) hi = (hi + 3) % PALETTE.length;
  usedHues.add(hi);
  const hue = (PALETTE[hi]! + (rnd() - 0.5) * 14 + 360) % 360;

  const vowelShare = st.vowels / n;
  const calm = st.spaces / Math.max(1, st.total);
  const g: Genome = GENES.map((d) => d.fallback);
  const set = (id: GeneId, state: number) => (g[GENE_INDEX[id]] = state);
  const near = (id: GeneId, value: number) => set(id, nearest(id, value));
  set('body', BODIES.indexOf(body));
  set('diet', DIETS.indexOf(diet));
  near('size', 11 + vowelShare * 12 + Math.min(10, avgLen) * 0.9);
  near('speed', (1 + (st.held / n) * 0.8 + has('!') * 0.08) * (1 - Math.min(0.5, calm * 0.8)));
  set('fertility', Math.min(3, has('+')));
  set('hue', Math.round(hue / HUE_STEP) % 32);
  // the rnd() calls stay in this order (hue2, sat, life, wobble): a text keeps the creature it always grew
  set('hue2', Math.round(((hue + 40 + rnd() * 60) % 360) / HUE_STEP) % 32);
  near('sat', 55 + rnd() * 35);
  near('toxic', Math.min(1, has('!') * 0.25 + (st.emoji.includes('☠️') ? 0.5 : 0)));
  near('armor', Math.min(0.9, (body === 'diatom' ? 0.6 : 0) + has('#') * 0.15));
  near('glow', Math.min(1, has('*') * 0.3 + (diet === 'photo' ? 0.25 : 0.08) + (st.emoji.some((e) => e === '✨' || e === '💡') ? 0.4 : 0)));
  near('colony', Math.min(1, (body === 'coccus' ? 0.75 : body === 'volvox' ? 0.5 : 0.05) + has('(') * 0.1));
  set('symbiosis', has('&') > 0 || st.emoji.some((e) => EMOJI[e]?.(0, 0).k === 'bond') ? 1 : 0);
  set('spores', has('.') >= 3 || st.emoji.includes('🍄') ? 1 : 0);
  near('life', 70 + rnd() * 70);
  near('mutation', Math.min(0.5, 0.04 + has('?') * 0.08));
  near('wobble', body === 'amoeba' ? 1 : 0.25 + rnd() * 0.2);
  set('organelles', 1 + (seed % 5));
  set(
    'flagella',
    body === 'flagellate' ? 1 + Math.min(2, has('~')) : body === 'spirillum' ? 2 : body === 'bacillus' && seed % 3 === 0 ? 1 : 0,
  );
  set('lobes', 1 + (seed % 3));
  return g;
}

/** the species a genome grows into: every trait from its genes, plus the ones that follow from them */
export function express(g: Genome, seed: number, line: number): Species {
  const lv = (id: GeneId) => levelOf(id, g[GENE_INDEX[id]]!);
  const body = BODIES[g[GENE_INDEX.body]!]!;
  const diet = DIETS[g[GENE_INDEX.diet]!]!;
  const hunter = diet === 'hunter';
  const size = Math.max(6, Math.min(36, lv('size') * SIZE[body] * (hunter ? 1.3 : 1)));
  return {
    seed,
    line,
    name: nameOf(g),
    body,
    diet,
    hue: g[GENE_INDEX.hue]! * HUE_STEP,
    hue2: g[GENE_INDEX.hue2]! * HUE_STEP,
    sat: lv('sat'),
    size,
    speed: SPEED[body] * lv('speed') * (hunter ? 1.15 : 1),
    sense: 70 + size * 4 * (hunter ? 1.5 : 1),
    agility: body === 'amoeba' || body === 'volvox' ? 1.2 : 2.6,
    toxic: lv('toxic'),
    armor: lv('armor'),
    glow: lv('glow'),
    colony: lv('colony'),
    symbiosis: g[GENE_INDEX.symbiosis] === 1,
    spores: g[GENE_INDEX.spores] === 1,
    divideAt: 90 * Math.pow(size / 14, 1.1) * (1 - lv('fertility') * 0.15),
    life: lv('life'),
    mutation: lv('mutation'),
    wobble: lv('wobble'),
    organelles: lv('organelles'),
    cilia: body === 'ciliate',
    flagella: lv('flagella'),
    lobes: lv('lobes'),
    parents: null,
    variantOf: null,
    genome: g,
  };
}

/** a species made by hand (the lab): its seed is its sequence, so the same genes are the same specimen */
export function specimen(g: Genome, parents: [Species, Species] | null = null): Species {
  const sp = express(g, hash(encodeGenome(g)), -1);
  sp.parents = parents;
  return sp;
}

/** the plain genome of a body type: the lab's built-in specimens */
export function typeGenome(body: Body): Genome {
  const g: Genome = GENES.map((d) => d.fallback);
  const set = (id: GeneId, state: number) => (g[GENE_INDEX[id]] = state);
  set('body', BODIES.indexOf(body));
  const photo = body === 'diatom' || body === 'volvox';
  if (photo) set('diet', DIETS.indexOf('photo'));
  set('flagella', body === 'spirillum' ? 2 : body === 'flagellate' || body === 'bacillus' ? 1 : 0);
  if (body === 'amoeba') set('wobble', 3);
  if (body === 'diatom') set('armor', 2);
  if (body === 'coccus') set('colony', 2);
  if (body === 'volvox') set('colony', 1);
  if (photo) set('glow', 1);
  const hue = Math.round(PALETTE[BODIES.indexOf(body)]! / HUE_STEP) % 32;
  set('hue', hue);
  set('hue2', (hue + 6) % 32);
  return g;
}

/** a copy with `n` different genes changed: a level or colour a step or a few, a switch to another state */
export function mutateGenome(g: Genome, rnd: () => number, n: number): Genome {
  const out = g.slice();
  const open = GENES.map((_, i) => i);
  for (; n > 0 && open.length; n--) {
    const i = open.splice(Math.floor(rnd() * open.length), 1)[0]!;
    const d = GENES[i]!,
      s = out[i]!;
    if (d.kind === 'level') out[i] = s === 0 ? 1 : s === d.states - 1 ? s - 1 : s + (rnd() < 0.5 ? -1 : 1);
    else if (d.kind === 'circle') out[i] = (s + (rnd() < 0.5 ? -1 : 1) * (1 + Math.floor(rnd() * 4)) + d.states) % d.states;
    else out[i] = (s + 1 + Math.floor(rnd() * (d.states - 1))) % d.states;
  }
  return out;
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
      case 'space':
        if (t.n >= 3) add(t, { k: 'rest' });
        break;
      case 'word': {
        const len = t.letters.length;
        add(
          t,
          sp ? { k: 'spawn', n: Math.min(3, 1 + Math.floor(len / 6)), u, v } : { k: 'food', n: 2, u, v, kind: 'crumb' },
          len >= 6 ? 2 : 1,
        );
        break;
      }
      case 'num':
        add(t, { k: 'food', n: Math.max(1, Math.min(7, Math.round(Math.abs(t.value)) % 8)), u, v, kind: 'algae' });
        break;
      case 'math': {
        const val = Number.isFinite(t.value) ? t.value : 0;
        add(t, { k: 'note', text: `${t.text} = ${Number.isFinite(t.value) ? Number(t.value.toPrecision(6)) : '∞'}`, u, v });
        out.push({ g0: t.g0, g1: t.g1, beats: 1, act: { k: 'food', n: 2 + (Math.round(Math.abs(val)) % 6), u, v, kind: 'algae' } });
        break;
      }
      case 'quote':
        add(t, { k: 'note', text: t.text || '…', u, v }, 2);
        break;
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
          const pool: Act[] = [
            { k: 'light', u, v },
            { k: 'burst', u, v },
            { k: 'food', n: 4, u, v, kind: 'algae' },
            { k: 'current', u, v, swirl: 1, angle: 0 },
          ];
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
    const g = readGenome(text, toks, used);
    let sp: Species | null = null;
    if (g) {
      const seed = hash(text.trim() || 'blank');
      sp = old.get(seed) ?? null;
      if (sp) sp.line = i; // same genome: the living population keeps its species
      else {
        sp = express(g, seed, i);
        const base = sp.name;
        for (let k = 2; species.some((s) => s.name === sp!.name); k++) sp.name = `${base} ${k}`;
      }
      species.push(sp);
    }
    lines.push({ line: i, text, species: sp, steps: steps(L.gs, toks, sp, i), hue: sp ? sp.hue : 190 });
  });
  return { gs: L.gs, lines, species };
}
