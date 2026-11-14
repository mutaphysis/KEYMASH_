import { test, expect } from 'bun:test';
import { readCulture, pronounce } from '../src/modes/petri/genome';
import { Petri } from '../src/modes/petri/culture';
import { DISH_R, MAX_CELLS, MAX_FOOD } from '../src/modes/petri/sim';
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
