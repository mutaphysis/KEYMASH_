import { test, expect } from 'bun:test';
import { readCulture, pronounce } from '../src/modes/petri/genome';
import type { Species } from '../src/modes/petri/genome';
import { Petri } from '../src/modes/petri/culture';
import { hybridise } from '../src/modes/petri/hybrid';
import { DISH_R, MAX_CELLS, MAX_FOOD, MAX_HYBRIDS } from '../src/modes/petri/sim';
import { mulberry32 } from '../src/lang/rng';

const POOL = [
  ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZäöü0123456789',
  ...'!?.,;:~-_|/\\*#@$%^+=<>&(){}[]`\'" \n\n\t',
  '🌿',
  '☀️',
  '💧',
  '🫧',
  '🍄',
  '🦠',
  '❄️',
  '🔥',
  '☠️',
  '🍬',
  '💞',
  '🐶',
  '漢',
  '\uD800',
];
const prog = (r: () => number, n: number) => Array.from({ length: n }, () => POOL[Math.floor(r() * POOL.length)]).join('');

function check(p: Petri) {
  const W = p.world;
  expect(W.cells.length).toBeLessThanOrEqual(MAX_CELLS);
  expect(W.food.length).toBeLessThanOrEqual(MAX_FOOD);
  for (const c of W.cells) {
    for (const v of [c.x, c.y, c.vx, c.vy, c.r, c.energy, c.heading]) expect(Number.isFinite(v)).toBe(true);
    expect(Math.hypot(c.x, c.y)).toBeLessThanOrEqual(DISH_R + 1);
  }
  for (const f of W.food) expect(Math.hypot(f.x, f.y)).toBeLessThanOrEqual(DISH_R + 1);
}

test('every line is a species (unless it has no letters), every species has a name', () => {
  const c = readCulture('asdf jkl\n3 . 5 . 🌿\nHUNTER >>>\n\n🦠');
  expect(c.lines.length).toBe(4);
  expect(c.species.length).toBe(3);
  expect(c.lines[1]!.species).toBeNull();
  for (const s of c.species) {
    expect(s.name).toMatch(/^[A-Z][a-z]+ [a-z]+$/);
    expect(s.size).toBeGreaterThan(5);
  }
  expect(c.species[1]!.diet).toBe('hunter');
  expect(pronounce('jjjjkkkkllll', mulberry32(1))).toMatch(/^j[aeiou]?k/);
});

test('species keep their identity across a live edit', () => {
  const p = new Petri('asdf jkl\nqwer');
  const sp = p.species[0]!;
  p.swap('asdf jkl\nqwer\nzxcv');
  expect(p.species[0]).toBe(sp);
  expect(p.species.length).toBe(3);
});

test('quotes count glyphs, not UTF-16 units: emoji in a quote make a line no calmer than letters', () => {
  const speed = (src: string) => readCulture(src).species[0]!.speed;
  expect(speed('asdf   "🐶🐶🐶🐶"')).toBe(speed('asdf   "abcd"'));
});

test('fuzz: random cultures for 90 s each never break the world', () => {
  const r = mulberry32(3);
  for (let i = 0; i < 40; i++) {
    const p = new Petri(prog(r, Math.floor(r() * 160)));
    for (let t = 0; t < 90 * 10; t++) {
      p.tick(0.1);
      if (t % 50 === 0) check(p);
    }
    check(p);
  }
}, 120000);

test('a culture with food lives: cells eat, divide and die, debris feeds the next', () => {
  const p = new Petri('asdf jkl ölk\n🌿 7 . 7 . ☀️\nqwert zuiop');
  const seen = new Map<string, number>();
  for (let t = 0; t < 240 * 10; t++) for (const e of p.tick(0.1)) seen.set(e.type, (seen.get(e.type) ?? 0) + 1);
  for (const k of ['spawn', 'eat', 'divide', 'die', 'read']) expect(seen.get(k) ?? 0).toBeGreaterThan(0);
  expect(p.world.cells.length).toBeGreaterThan(3);
});

test('hunters engulf smaller cells of other species', () => {
  const p = new Petri('mmm nnn bbb yyy xxx ccc vvv\nHUNTER GRRR >>\n🌿 9 9 9');
  let engulfs = 0;
  for (let t = 0; t < 300 * 10; t++) for (const e of p.tick(0.1)) if (e.type === 'engulf') engulfs++;
  expect(engulfs).toBeGreaterThan(0);
});

test('a meal passes 1–3 genes on: each moves toward the donor, the hybrid names both parents', () => {
  const [a0, b] = readCulture('asdf jkl\nHUNTER GRRR >> ~~~ !!! ###').species as [Species, Species];
  const a = { ...a0, mutation: 0 }; // without mutation every gene must land between the parents
  const r = mulberry32(7);
  for (let i = 0; i < 50; i++) {
    const h = hybridise(a, b, r, () => false)!;
    expect(h.sp.parents).toEqual([a, b]);
    expect(h.sp.name).toMatch(/^Asd\w* × [a-z]+$/);
    expect(h.genes.length).toBeGreaterThanOrEqual(1);
    expect(h.genes.length).toBeLessThanOrEqual(3);
    for (const g of h.genes) {
      if (g === 'hue2') continue;
      const [va, vb, vh] = [a[g], b[g], h.sp[g]];
      if (typeof va === 'number') expect(Math.abs((vh as number) - (vb as number))).toBeLessThanOrEqual(Math.abs(va - (vb as number)));
      else expect(vh).toBe(vb);
    }
  }
  expect(hybridise(a, a, r, () => false)).toBeNull(); // nothing to take up from its own kind
});

test('hybrids live on: their daughters inherit the new genome, and only a few hybrid species live at once', () => {
  const p = new Petri('jfkdlsöä asdfghjkl JJJJJJJJJ\nkkkkk ddddd h h hhhh 🌿 5\nWOOF!!! ölkjhg qqqqqqq');
  let hybrids = 0,
    hybridBirths = 0;
  for (let t = 0; t < 300 * 10; t++) {
    for (const e of p.tick(0.1)) {
      if (e.type === 'hybrid') hybrids++;
      if (e.type === 'divide' && e.sp.parents) hybridBirths++;
    }
    const alive = [...p.world.counts].filter(([sp, n]) => sp.parents && n > 0).length;
    expect(alive).toBeLessThanOrEqual(MAX_HYBRIDS);
  }
  expect(hybrids).toBeGreaterThan(0);
  expect(hybridBirths).toBeGreaterThan(0);
});
