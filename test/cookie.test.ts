import { test, expect } from 'bun:test';
import { readRecipe, recipeKey, SHAPES } from '../src/modes/cookie/recipe';
import type { Stage } from '../src/modes/cookie/recipe';
import { Field, outline, anchors, distanceTransform, FIELD_N, FIELD_EXT } from '../src/modes/cookie/shapes';
import { Bakery, MAX_CRUMBS } from '../src/modes/cookie/bakery';
import type { BakeEvent } from '../src/modes/cookie/bakery';
import { mulberry32 } from '../src/lang/rng';

const POOL = [
  ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZäöü0123456789',
  ...'!?.,;:~-_|/\\*#@$%^+=<>&(){}[]`\'"° \n\n\t',
  '🍪',
  '⭐',
  '❤️',
  '🎄',
  '🐻',
  '🔔',
  '🍫',
  '🍯',
  '✨',
  '👀',
  '🍒',
  '🔥',
  '❄️',
  '漢',
  '\uD800',
  '\u0000',
];
const prog = (r: () => number, n: number) => Array.from({ length: n }, () => POOL[Math.floor(r() * POOL.length)]).join('');
const BEFORE_SERVE: Stage[] = ['drop', 'roll', 'cut', 'chips', 'bake', 'cool', 'coat', 'pattern', 'toppings', 'deco', 'present'];

test('keywords, numbers, symbols and quotes set the recipe', () => {
  const r = readRecipe('ginger star 3 180 12 "hi"');
  expect(r.dough).toBe('ginger');
  expect(r.shape).toBe('star');
  expect(r.count).toBe(3);
  expect(r.temp).toBe(180);
  expect(r.minutes).toBe(12);
  expect(r.message).toBe('hi');

  const icing = readRecipe('!!');
  expect(icing.coat).toBe('icing');
  expect(icing.flow).toBe('smooth');

  const joy = readRecipe('[JOY] :)');
  expect(joy.letters).toEqual(['J', 'O', 'Y']);
  expect(joy.face).toBe('smile');
  expect(joy.extra).toBeNull();

  const blank = readRecipe('');
  expect(blank.message).toBe('');
  expect(blank.count).toBeGreaterThanOrEqual(1);
  expect(blank.count).toBeLessThanOrEqual(3);
});

test('fuzz: any text is a recipe with every value in range', () => {
  const r = mulberry32(5);
  const within = (v: number, lo: number, hi: number) => {
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(lo);
    expect(v).toBeLessThanOrEqual(hi);
  };
  for (let i = 0; i < 300; i++) {
    const src = prog(r, Math.floor(r() * 160));
    const c = readRecipe(src);
    within(c.count, 1, 3);
    within(c.thickness, 0.14, 0.36);
    within(c.rise, 0, 1);
    within(c.chips, 0, 16);
    within(c.variant, 0, 2);
    within(c.wobble, 0, 1);
    within(c.size, 0.8, 1.15);
    within(c.temp, 120, 260);
    within(c.minutes, 4, 30);
    within(c.bake, 0.1, 2);
    within(c.glitter, 0, 1);
    expect(Number.isFinite(c.rotation)).toBe(true);
    for (const v of [...c.color, ...c.accent]) within(v, 0, 1);
    expect(c.toppings.length).toBeLessThanOrEqual(2);
    for (const tp of c.toppings) within(tp.amount, 0.1, 1);
    expect(c.letters.length).toBeLessThanOrEqual(3);
    expect(recipeKey(readRecipe(src))).toBe(recipeKey(c));
  }
});

test('every cutter is a sensible cookie and its anchors sit well inside', () => {
  const texel = ((2 * FIELD_EXT) / FIELD_N) ** 2;
  for (const shape of SHAPES)
    for (const variant of [0, 1, 2])
      for (const wobble of [0, 1]) {
        const f = new Field(outline(shape, variant, wobble, 7));
        const area = f.area0 * texel;
        const tag = `${shape} ${variant} ${wobble}`;
        expect([tag, area > 1.7 && area < 3.2]).toEqual([tag, true]);
        for (let i = 0; i < FIELD_N; i++)
          for (const k of [i, (FIELD_N - 1) * FIELD_N + i, i * FIELD_N, i * FIELD_N + FIELD_N - 1])
            expect(f.data[k * 4]!).toBeGreaterThan(0);
        for (const face of [false, true]) {
          const a = anchors(shape, variant, face);
          for (const [x, y] of [...a.eyes, a.letters, a.mouth])
            expect([tag, face, x, y, f.d(x, y) <= -0.12]).toEqual([tag, face, x, y, true]);
        }
      }
});

test('distanceTransform: negative inside, positive outside, growing with distance', () => {
  const n = 9;
  const mask = new Uint8Array(n * n);
  for (let y = 3; y < 6; y++) for (let x = 3; x < 6; x++) mask[y * n + x] = 1;
  const d = distanceTransform(mask, n);
  expect(d[4 * n + 4]!).toBeLessThan(0);
  expect(d[0]!).toBeGreaterThan(0);
  for (let x = 4; x < n - 1; x++) expect(d[4 * n + x + 1]!).toBeGreaterThan(d[4 * n + x]!);
});

test('fuzz: every recipe bakes through to serving', () => {
  const r = mulberry32(11);
  for (let i = 0; i < 30; i++) {
    const src = prog(r, Math.floor(r() * 160));
    for (const aspect of [0.75, 1.8]) {
      const b = new Bakery(src, aspect);
      for (let t = 0; t < 40 / 0.05; t++) {
        b.tick(0.05);
        for (const v of Object.values(b.look)) expect(Number.isFinite(v)).toBe(true);
      }
      expect(b.stage).toBe('serve');
      expect(b.cookies.length).toBe(b.recipe.count);
    }
  }
});

test('eating: bites carve the cookies, crumbs stay bounded, an empty tray starts a new batch', () => {
  const b = new Bakery('round 2', 1.5);
  const seen: BakeEvent[] = [];
  const tick = (dt: number) => {
    seen.push(...b.tick(dt));
    expect(b.crumbs.length).toBeLessThanOrEqual(MAX_CRUMBS);
    for (const c of b.crumbs) for (const v of [c.x, c.y, c.z, c.vx, c.vy, c.vz, c.r, c.life]) expect(Number.isFinite(v)).toBe(true);
  };
  const stage = (): Stage => b.stage; // a call, so tsc does not narrow across ticks
  while (stage() !== 'serve') tick(0.05);
  expect(b.bite(50, 5, 50, 0, -1, 0)).toBe(false);
  let bites = 0;
  outer: for (let sweep = 0; sweep < 12; sweep++)
    for (let z = -3; z <= 3; z += 0.25)
      for (let x = -4; x <= 4; x += 0.25) {
        if (stage() !== 'serve') break outer;
        if (b.bite(x, 5, z, 0, -1, 0)) bites++;
        tick(0.2);
      }
  expect(bites).toBeGreaterThan(6);
  for (let i = 0; i < 80 && !(stage() === 'drop' && b.batch === 1); i++) tick(0.05);
  expect(seen.filter((e) => e.type === 'gone').length).toBe(2);
  expect(seen.findIndex((e) => e.type === 'sweep')).toBeGreaterThan(seen.findIndex((e) => e.type === 'gone'));
  expect(stage()).toBe('drop');
  expect(b.batch).toBe(1);
});

test('a live edit rebakes only when the picture changes', () => {
  const b = new Bakery('butter round 2 180 12 plain', 1.5);
  for (let t = 0; t < 30; t += 0.05) b.tick(0.05);
  expect(b.stage).toBe('serve');
  expect(b.swap('butter round 2 180 12 plain')).toBe(false);
  expect(b.batch).toBe(0);
  expect(b.stage).toBe('serve');
  expect(b.swap('butter star 2 180 12 plain')).toBe(true);
  for (let t = 0; t < 3; t += 0.05) b.tick(0.05);
  expect(b.batch).toBe(1);
  expect(BEFORE_SERVE).toContain(b.stage);
  expect(b.recipe.shape).toBe('star');
});
