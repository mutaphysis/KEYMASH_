import { test, expect } from 'bun:test';
import {
  readCulture,
  kindOf,
  encodeGenome,
  decodeGenome,
  typeGenome,
  nameOf,
  specimen,
  mutateGenome,
  GENES,
  GENE_INDEX,
  BODIES,
} from '../src/modes/petri/genome';
import type { Species } from '../src/modes/petri/genome';
import { Petri } from '../src/modes/petri/culture';
import { hybridise } from '../src/modes/petri/hybrid';
import { World, DISH_R, MAX_CELLS, MAX_FOOD, MAX_HYBRIDS } from '../src/modes/petri/sim';
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
});

test('a genome reads back from its sequence; a shorter, older sequence keeps its genes and gets fallbacks after', () => {
  for (const b of BODIES) {
    const g = typeGenome(b);
    expect(decodeGenome(encodeGenome(g))).toEqual(g);
    const short = decodeGenome(encodeGenome(g).slice(0, 11));
    expect(short.slice(0, 7)).toEqual(g.slice(0, 7));
    expect(short.slice(7)).toEqual(GENES.slice(7).map((d) => d.fallback));
  }
});

test('names come from the genome: the same line is called the same, any genome gets a binomial', () => {
  expect(readCulture('qwert zuiop\nasdf').species[0]!.name).toBe(readCulture('xx\nqwert zuiop').species[1]!.name);
  const r = mulberry32(5);
  for (let i = 0; i < 200; i++) expect(nameOf(GENES.map((d) => Math.floor(r() * d.states)))).toMatch(/^[A-Z][a-z]+ [a-z]+$/);
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
    expect(h.sp.name).toMatch(new RegExp('^' + a.name.split(' ')[0] + ' × [a-z]+$'));
    expect(h.genes.length).toBeGreaterThanOrEqual(1);
    expect(h.genes.length).toBeLessThanOrEqual(3);
    for (const g of h.genes) {
      const i = GENE_INDEX[g],
        d = GENES[i]!;
      const [sa, sb, sh] = [a.genome[i]!, b.genome[i]!, h.sp.genome[i]!];
      if (d.kind === 'level') expect(Math.abs(sh - sb)).toBeLessThanOrEqual(Math.abs(sa - sb));
      else if (d.kind === 'switch') expect(sh).toBe(sb);
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

test("speciation 'drift': a meal changes the genome but not the species, until it has drifted far enough to split off", () => {
  const p = new Petri('jfkdlsöä asdfghjkl JJJJJJJJJ\nkkkkk ddddd h h hhhh 🌿 5\nWOOF!!! ölkjhg qqqqqqq');
  p.world.speciation = 'drift';
  let variants = 0,
    splits = 0;
  for (let t = 0; t < 300 * 10; t++) {
    for (const e of p.tick(0.1)) if (e.type === 'hybrid') splits++;
    for (const c of p.world.cells) {
      const kind = c.sp.variantOf;
      if (!kind) continue;
      variants++;
      expect(c.sp.name).toBe(kind.name); // still one of its kind
      expect(kind.variantOf).toBeNull();
    }
  }
  // the census counts variants with their species
  for (const [kind, n] of p.world.counts) expect(p.world.cells.filter((c) => kindOf(c.sp) === kind).length).toBe(n);
  expect(variants).toBeGreaterThan(0);
  expect(splits).toBeGreaterThan(0);
});

/** a dish with a few cells of two built-in specimens, nothing else */
function labDish() {
  const W = new World(9);
  const a = specimen(typeGenome('amoeba')),
    b = specimen(typeGenome('coccus'));
  const cells = [W.spawnCell(a, -100, 0)!, W.spawnCell(a, 100, 0)!, W.spawnCell(b, 0, 100)!];
  W.step(1 / 30);
  return { W, a, b, cells };
}

test('lab: kill dissolves a cell, remove takes it out at once without an extinction', () => {
  const { W, a, b, cells } = labDish();
  W.kill(cells[0]!);
  expect(W.events().some((e) => e.type === 'die' && e.cause === 'killed')).toBe(true);
  W.step(1 / 30);
  expect(cells[0]!.state).toBe('dying');
  W.remove(cells[2]!);
  expect(W.cells.includes(cells[2]!)).toBe(false);
  expect(W.population(b)).toBe(0);
  expect(W.population(a)).toBe(2);
  for (let i = 0; i < 30; i++) expect(W.step(1 / 30).some((e) => e.type === 'extinct' && e.sp === b)).toBe(false);
});

test('lab: forceDivide starts a division, retype moves the cell to a new species', () => {
  const { W, a, cells } = labDish();
  expect(W.forceDivide(cells[0]!)).toBe(true);
  expect(W.events().some((e) => e.type === 'divideStart')).toBe(true);
  expect(cells[0]!.state).toBe('dividing');
  const m = specimen(mutateGenome(a.genome, mulberry32(2), 3));
  W.retype(cells[1]!, m);
  expect(W.events().some((e) => e.type === 'mutant' && e.sp === m && e.from === a)).toBe(true);
  W.step(1 / 30);
  expect(W.population(m)).toBe(1);
  expect(W.population(a)).toBe(1);
  expect(cells[1]!.sp).toBe(m);
});

test('lab: clear empties the dish and restore brings it back', () => {
  const { W, a } = labDish();
  const before = W.cells;
  const s = W.clear();
  expect(W.cells.length + W.food.length).toBe(0);
  expect(W.step(1 / 30).some((e) => e.type === 'extinct')).toBe(false);
  W.restore(s);
  expect(W.cells).toBe(before);
  expect(W.population(a)).toBe(2);
});

test('lab: a held cell stays where it is held', () => {
  const { W, cells } = labDish();
  const c = cells[0]!;
  c.held = true;
  const [x, y, age] = [c.x, c.y, c.age];
  for (let i = 0; i < 30; i++) W.step(1 / 30);
  expect([c.x, c.y, c.age]).toEqual([x, y, age]);
});
