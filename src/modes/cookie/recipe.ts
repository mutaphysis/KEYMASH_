// COOKIE_'s language: the whole text is one recipe. Keywords, symbols, emoji and numbers set the
// dough, the cutter, the oven and the decoration; everything left open is drawn from the text's
// seed. Any text is a recipe: this never throws.
import { lex, graphemes } from '../../lang/lexer';
import { hash, mulberry32 } from '../../lang/rng';

export type Dough = 'butter' | 'ginger' | 'cocoa' | 'oat' | 'matcha';
export type Shape = 'round' | 'star' | 'heart' | 'tree' | 'bear' | 'bell';
export type Coat = 'none' | 'icing' | 'chocolate' | 'glaze';
export type Flow = 'thick' | 'smooth' | 'runny';
export type Pattern = 'plain' | 'stripes' | 'zigzag' | 'swirl' | 'half';
export type Topping = 'sprinkles' | 'sugar' | 'strands' | 'pearls';
export type Face = 'none' | 'eyes' | 'smile' | 'frown';
export type Extra = 'cherry' | 'almond';
export type Stage =
  | 'drop'
  | 'roll'
  | 'cut'
  | 'chips'
  | 'bake'
  | 'cool'
  | 'coat'
  | 'pattern'
  | 'toppings'
  | 'deco'
  | 'present'
  | 'serve'
  | 'sweep';
export type RGB = [number, number, number]; // sRGB 0..1
export interface Mark {
  stage: Stage;
  g0: number;
  g1: number;
}
export interface Recipe {
  seed: number;
  gs: string[];
  count: 1 | 2 | 3;
  dough: Dough;
  thickness: number;
  rise: number;
  chips: number;
  shape: Shape;
  variant: 0 | 1 | 2;
  wobble: number;
  rotation: number;
  size: number;
  temp: number;
  minutes: number;
  bake: number;
  coat: Coat;
  color: RGB;
  accent: RGB;
  flow: Flow;
  pattern: Pattern;
  border: boolean;
  toppings: { kind: Topping; amount: number }[];
  glitter: number;
  face: Face;
  letters: string[];
  extra: Extra | null;
  message: string; // '' means: use the default greeting
  marks: Mark[];
}

export const DOUGHS: readonly Dough[] = ['butter', 'ginger', 'cocoa', 'oat', 'matcha'];
export const SHAPES: readonly Shape[] = ['round', 'star', 'heart', 'tree', 'bear', 'bell'];
export const TOPPINGS: readonly Topping[] = ['sprinkles', 'sugar', 'strands', 'pearls'];

type Colour = 'white' | 'pink' | 'red' | 'orange' | 'yellow' | 'green' | 'mint' | 'blue' | 'purple';
const COLOURS: readonly Colour[] = ['white', 'pink', 'red', 'orange', 'yellow', 'green', 'mint', 'blue', 'purple'];
export const ICING: Record<Colour, RGB> = {
  white: [0.97, 0.96, 0.93],
  pink: [0.98, 0.62, 0.72],
  red: [0.85, 0.16, 0.2],
  orange: [0.98, 0.62, 0.25],
  yellow: [0.99, 0.86, 0.36],
  green: [0.45, 0.74, 0.4],
  mint: [0.62, 0.9, 0.78],
  blue: [0.45, 0.68, 0.95],
  purple: [0.7, 0.55, 0.9],
};
export const CHOC = {
  dark: [0.2, 0.1, 0.06] as RGB,
  milk: [0.42, 0.24, 0.14] as RGB,
  white: [0.95, 0.89, 0.76] as RGB,
  ruby: [0.8, 0.45, 0.55] as RGB,
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const luma = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** what the text asked for outright; everything undefined falls back to a symbol rule or the seed */
interface Asked {
  count?: 1 | 2 | 3;
  dough?: Dough;
  thickness?: number;
  rise?: number;
  chipWord: boolean;
  shape?: Shape;
  size?: number;
  temp?: number;
  minutes?: number;
  coat?: Coat;
  flow?: Flow;
  colours: Colour[];
  pattern: Set<Pattern>;
  border: boolean;
  top: Record<Topping, number>;
  glitter: number;
  eyes: boolean;
  extra?: Extra;
}

type Apply = (a: Asked) => void;
const kw = (stage: Stage, apply: Apply): [Stage, Apply] => [stage, apply];
const colour = (c: Colour) =>
  kw('coat', (a) => {
    a.colours.push(c);
  });
const extra = (e: Extra) =>
  kw('deco', (a) => {
    a.extra ??= e;
  });

const WORDS: Record<string, [Stage, Apply]> = {
  one: kw('cut', (a) => (a.count = 1)),
  two: kw('cut', (a) => (a.count = 2)),
  three: kw('cut', (a) => (a.count = 3)),
  butter: kw('drop', (a) => (a.dough = 'butter')),
  ginger: kw('drop', (a) => (a.dough = 'ginger')),
  gingerbread: kw('drop', (a) => (a.dough = 'ginger')),
  cocoa: kw('drop', (a) => (a.dough = 'cocoa')),
  oat: kw('drop', (a) => (a.dough = 'oat')),
  oats: kw('drop', (a) => (a.dough = 'oat')),
  matcha: kw('drop', (a) => (a.dough = 'matcha')),
  thin: kw('roll', (a) => (a.thickness = 0.14)),
  thick: kw('roll', (a) => (a.thickness = 0.34)),
  flat: kw('bake', (a) => (a.rise = 0)),
  puffy: kw('bake', (a) => (a.rise = 1)),
  chip: kw('chips', (a) => (a.chipWord = true)),
  chips: kw('chips', (a) => (a.chipWord = true)),
  round: kw('cut', (a) => (a.shape = 'round')),
  circle: kw('cut', (a) => (a.shape = 'round')),
  star: kw('cut', (a) => (a.shape = 'star')),
  heart: kw('cut', (a) => (a.shape = 'heart')),
  tree: kw('cut', (a) => (a.shape = 'tree')),
  bear: kw('cut', (a) => (a.shape = 'bear')),
  bell: kw('cut', (a) => (a.shape = 'bell')),
  tiny: kw('cut', (a) => (a.size = 0.8)),
  small: kw('cut', (a) => (a.size = 0.88)),
  big: kw('cut', (a) => (a.size = 1.08)),
  huge: kw('cut', (a) => (a.size = 1.15)),
  icing: kw('coat', (a) => (a.coat = 'icing')),
  frosting: kw('coat', (a) => (a.coat = 'icing')),
  chocolate: kw('coat', (a) => (a.coat = 'chocolate')),
  choco: kw('coat', (a) => (a.coat = 'chocolate')),
  dip: kw('coat', (a) => (a.coat = 'chocolate')),
  glaze: kw('coat', (a) => (a.coat = 'glaze')),
  plain: kw('coat', (a) => (a.coat = 'none')),
  naked: kw('coat', (a) => (a.coat = 'none')),
  matte: kw('coat', (a) => (a.flow = 'thick')),
  glossy: kw('coat', (a) => (a.flow = 'smooth')),
  runny: kw('coat', (a) => (a.flow = 'runny')),
  white: colour('white'),
  red: colour('red'),
  pink: colour('pink'),
  orange: colour('orange'),
  yellow: colour('yellow'),
  green: colour('green'),
  mint: colour('mint'),
  blue: colour('blue'),
  purple: colour('purple'),
  stripes: kw('pattern', (a) => a.pattern.add('stripes')),
  zigzag: kw('pattern', (a) => a.pattern.add('zigzag')),
  swirl: kw('pattern', (a) => a.pattern.add('swirl')),
  border: kw('pattern', (a) => (a.border = true)),
  sprinkles: kw('toppings', (a) => (a.top.sprinkles += 2)),
  sugar: kw('toppings', (a) => (a.top.sugar += 2)),
  strands: kw('toppings', (a) => (a.top.strands += 2)),
  pearls: kw('toppings', (a) => (a.top.pearls += 2)),
  glitter: kw('toppings', (a) => (a.glitter += 1)),
  eyes: kw('deco', (a) => (a.eyes = true)),
  cherry: extra('cherry'),
  nut: extra('almond'),
  almond: extra('almond'),
};

const shape = (s: Shape) => kw('cut', (a) => (a.shape = s));
const EMOJI: Record<string, [Stage, Apply]> = {
  '🍪': shape('round'),
  '⭐': shape('star'),
  '🌟': shape('star'),
  '❤': shape('heart'),
  '💖': shape('heart'),
  '♥': shape('heart'),
  '🎄': shape('tree'),
  '🌲': shape('tree'),
  '🐻': shape('bear'),
  '🧸': shape('bear'),
  '🔔': shape('bell'),
  '🥛': kw('coat', (a) => (a.coat = 'icing')),
  '🍫': kw('coat', (a) => (a.coat = 'chocolate')),
  '🍯': kw('coat', (a) => (a.coat = 'glaze')),
  '🍓': colour('pink'),
  '🍋': colour('yellow'),
  '🍊': colour('orange'),
  '🥝': colour('green'),
  '🫐': colour('blue'),
  '🍇': colour('purple'),
  '🍒': extra('cherry'),
  '🥜': extra('almond'),
};
// symbols and emoji that only count (their rule is resolved after the walk), with the stage they light up
const COUNTED: Record<string, Stage> = {
  '.': 'chips',
  '/': 'cut',
  '\\': 'cut',
  '🔥': 'bake',
  '❄': 'bake',
  '!': 'coat',
  '=': 'pattern',
  '~': 'pattern',
  '@': 'pattern',
  '%': 'pattern',
  '#': 'pattern',
  '*': 'toppings',
  '+': 'toppings',
  '-': 'toppings',
  '°': 'toppings',
  '🔮': 'toppings',
  '^': 'toppings',
  '✨': 'toppings',
  ':': 'deco',
  ')': 'deco',
  '(': 'deco',
  '👀': 'deco',
};

export function readRecipe(src: unknown): Recipe {
  const { gs, lines } = lex(src);
  const text = gs.join('');
  const seed = hash(text.trim() || 'blank');
  const rnd = mulberry32(seed);
  // always all of them, in this order: an edit to one explicit token must not reshuffle the rest
  const dCount = rnd();
  const dVariant = rnd();
  const dWobble = rnd();
  const dRot = rnd();
  const dTemp = rnd();
  const dMin = rnd();
  const dCoat = rnd();
  const dColor = rnd();
  const dFlow = rnd();
  const dTop = rnd();
  const dThick = rnd();

  const a: Asked = {
    chipWord: false,
    colours: [],
    pattern: new Set(),
    border: false,
    top: { sprinkles: 0, sugar: 0, strands: 0, pearls: 0 },
    glitter: 0,
    eyes: false,
  };
  const marks: Mark[] = [];
  const words: { lower: string; g0: number; g1: number }[] = [];
  const count = new Map<string, number>();
  const has = (ch: string) => count.get(ch) ?? 0;
  let nLetters = 0;
  let upper = 0;
  let held = 0;
  let message = '';
  const letters: string[] = [];

  const number = (value: number, g0: number, g1: number) => {
    if (!Number.isFinite(value)) return;
    const v = Math.floor(value);
    if (v >= 1 && v <= 3) {
      a.count = v as 1 | 2 | 3;
      marks.push({ stage: 'cut', g0, g1 });
    } else if (v >= 4 && v <= 99) {
      a.minutes = clamp(v, 4, 30);
      marks.push({ stage: 'bake', g0, g1 });
    } else if (v >= 100) {
      a.temp = clamp(v, 120, 260);
      marks.push({ stage: 'bake', g0, g1 });
    }
  };

  for (const line of lines) {
    let capture = false;
    for (const tok of line) {
      if (capture) {
        if (tok.t === 'sym' && tok.ch === ']') {
          capture = false;
          marks.push({ stage: 'deco', g0: tok.g0, g1: tok.g1 });
          continue;
        }
        for (const g of gs.slice(tok.g0, tok.g1)) if (g.trim() && letters.length < 3) letters.push(g);
        marks.push({ stage: 'deco', g0: tok.g0, g1: tok.g1 });
        continue;
      }
      switch (tok.t) {
        case 'space':
          break;
        case 'quote':
          message = graphemes(tok.text.trim()).slice(0, 40).join('');
          marks.push({ stage: 'present', g0: tok.g0, g1: tok.g1 });
          break;
        case 'num':
          number(tok.value, tok.g0, tok.g1);
          break;
        case 'math':
          number(tok.value, tok.g0, tok.g1);
          break;
        case 'word': {
          words.push({ lower: tok.lower, g0: tok.g0, g1: tok.g1 });
          let prev = '';
          for (const l of tok.letters) {
            const low = l.ch.toLowerCase();
            nLetters++;
            if (l.ch !== low) upper++;
            if (low === prev) held++;
            prev = low;
          }
          const hit = Object.hasOwn(WORDS, tok.lower) ? WORDS[tok.lower] : undefined;
          if (hit) {
            hit[1](a);
            marks.push({ stage: hit[0], g0: tok.g0, g1: tok.g1 });
          }
          break;
        }
        case 'sym':
        case 'emoji': {
          const ch = tok.t === 'emoji' ? tok.ch.replace(/\uFE0F/g, '') : tok.ch;
          if (ch === '[') {
            capture = true;
            marks.push({ stage: 'deco', g0: tok.g0, g1: tok.g1 });
            break;
          }
          count.set(ch, (count.get(ch) ?? 0) + tok.n);
          const hit = Object.hasOwn(EMOJI, ch) ? EMOJI[ch] : undefined;
          if (hit) hit[1](a);
          const stage = hit ? hit[0] : Object.hasOwn(COUNTED, ch) ? COUNTED[ch] : undefined;
          if (stage) marks.push({ stage, g0: tok.g0, g1: tok.g1 });
          break;
        }
      }
    }
  }

  // dough and cutter: asked for, or from the words themselves
  let dough: Dough = a.dough ?? 'butter';
  if (!a.dough && words.length) {
    const w = words[0]!;
    dough = DOUGHS[hash(w.lower) % DOUGHS.length]!;
    marks.push({ stage: 'drop', g0: w.g0, g1: w.g1 });
  }
  let cutter: Shape = a.shape ?? 'round';
  if (!a.shape && words.length) {
    const w = words.reduce((l, c) => (c.lower.length > l.lower.length ? c : l), words[0]!);
    cutter = SHAPES[hash('s' + w.lower) % SHAPES.length]!;
    marks.push({ stage: 'cut', g0: w.g0, g1: w.g1 });
  }

  const G = gs.reduce((n, g) => n + (/^[\n\r\u2028\u2029]+$/.test(g) ? 0 : 1), 0);
  const thickness = a.thickness ?? clamp(0.17 + (0.17 * upper) / Math.max(1, nLetters) + 0.03 * (dThick - 0.5), 0.14, 0.36);
  const temp = clamp((a.temp ?? 160 + Math.round(dTemp * 8) * 5) + 20 * has('🔥') - 20 * has('❄'), 120, 260);
  const minutes = a.minutes ?? 9 + Math.floor(dMin * 6);

  let coat: Coat;
  if (a.coat) coat = a.coat;
  else if (has('!')) coat = 'icing';
  else if (has('%')) coat = 'chocolate';
  else coat = dCoat < 0.35 ? 'none' : dCoat < 0.65 ? 'icing' : dCoat < 0.85 ? 'chocolate' : 'glaze';
  const bangs = has('!');
  const flow: Flow =
    a.flow ??
    (bangs >= 3 ? 'runny' : bangs === 2 ? 'smooth' : bangs === 1 ? 'thick' : dFlow < 0.5 ? 'thick' : dFlow < 0.85 ? 'smooth' : 'runny');

  const named = a.colours[0];
  let color: RGB;
  if (coat === 'chocolate') {
    if (named) color = named === 'white' ? CHOC.white : named === 'pink' ? CHOC.ruby : CHOC.milk;
    else color = dColor < 0.45 ? CHOC.dark : dColor < 0.85 ? CHOC.milk : CHOC.white;
  } else color = ICING[named ?? COLOURS[Math.min(8, Math.floor(dColor * 9))]!];
  // an uncoated cookie has no base colour to show: its one named colour goes to the drizzle
  const second = coat === 'none' ? (a.colours[1] ?? named) : a.colours[1];
  const accent: RGB = second ? ICING[second] : coat === 'none' || luma(color) < 0.55 ? ICING.white : CHOC.dark;

  if (has('=')) a.pattern.add('stripes');
  if (has('~')) a.pattern.add('zigzag');
  if (has('@')) a.pattern.add('swirl');
  if (has('%')) a.pattern.add('half');
  const pattern: Pattern = (['half', 'swirl', 'zigzag', 'stripes'] as const).find((p) => a.pattern.has(p)) ?? 'plain';

  a.top.sprinkles += has('*');
  a.top.sugar += has('+');
  a.top.strands += has('-');
  a.top.pearls += has('°') + has('🔮');
  let toppings = TOPPINGS.filter((k) => a.top[k] > 0).map((kind) => ({ kind, amount: clamp(a.top[kind] / 4, 0.25, 1) }));
  const nGlitter = a.glitter + has('^') + has('✨');
  const glitter = nGlitter ? clamp(nGlitter / 3, 0.34, 1) : 0;
  let chips = Math.min(16, 3 * has('.') + (a.chipWord ? 8 : 0));
  const face: Face = has(')') ? 'smile' : has('(') ? 'frown' : has(':') || has('👀') || a.eyes ? 'eyes' : 'none';
  let extraPiece: Extra | null = a.extra ?? null;

  if (!toppings.length && !chips && face === 'none' && !letters.length && !extraPiece && !glitter) {
    if (dTop < 0.3) toppings = [{ kind: 'sprinkles', amount: 0.4 }];
    else if (dTop < 0.45) toppings = [{ kind: 'sugar', amount: 0.4 }];
  }

  // tidy: the cookie must never get crowded
  if (toppings.length > 2) toppings = [...toppings].sort((x, y) => y.amount - x.amount).slice(0, 2); // stable: ties keep the list order
  if (face !== 'none' || letters.length) {
    for (const tp of toppings) tp.amount *= 0.5;
    chips = Math.min(chips, 8);
  }
  if (letters.length) extraPiece = null;

  return {
    seed,
    gs,
    count: a.count ?? (Math.min(3, 1 + Math.floor(dCount * 3)) as 1 | 2 | 3),
    dough,
    thickness,
    rise: a.rise ?? clamp(0.2 + 0.2 * held, 0, 1),
    chips,
    shape: cutter,
    variant: Math.min(2, Math.floor(dVariant * 3)) as 0 | 1 | 2,
    wobble: dWobble,
    rotation: (((has('/') - has('\\')) * 15 + (dRot - 0.5) * 16) * Math.PI) / 180,
    size: a.size ?? clamp(0.8 + (0.35 * G) / 120, 0.8, 1.15),
    temp,
    minutes,
    bake: clamp(((temp - 100) / 80) * (minutes / 11), 0.1, 2),
    coat,
    color,
    accent,
    flow,
    pattern,
    border: a.border || has('#') > 0,
    toppings,
    glitter,
    face,
    letters,
    extra: extraPiece,
    message,
    marks,
  };
}

/** everything that changes the picture, as one string: equal keys mean no rebake */
export function recipeKey(r: Recipe): string {
  return JSON.stringify({ ...r, gs: undefined, marks: undefined });
}
