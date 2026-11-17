import { expect, test } from 'bun:test';
import { heightAt, mixGround, mossAt, readGround, ridgeAt, RIDGE_RISE, WORLD } from '../src/modes/mycelium/ground';
import { BURIED_MAX, isTreasure, reach, TREASURE_MAX } from '../src/modes/mycelium/buried';
import { CROWN_PIECES, LAYERS } from '../src/modes/mycelium/crown';
import { TREE_SCALE, TREES_MAX, TREES_MIN, TRUNKS } from '../src/modes/mycelium/trees';

const TEXTS = ['', 'a', 'under the spruces\nneedles and moss', '🍄🐌🪲', '\ud800 lone \udfff', '\0\0\0', 'x'.repeat(5000)];

test('any text gives a sane ground: finite, within reach of the view, horizons in order', () => {
  const rnd = (n: number) => String.fromCharCode(...Array.from({ length: n }, () => Math.floor(Math.random() * 0xffff)));
  for (const src of [...TEXTS, ...Array.from({ length: 200 }, (_, i) => rnd(i % 40))]) {
    const g = readGround(src);
    for (let x = WORLD.x0 - 400; x <= WORLD.x1 + 400; x += 7) {
      const y = heightAt(g, x);
      expect(Number.isFinite(y)).toBe(true);
      expect(Math.abs(y)).toBeLessThan(200);
      expect(Number.isFinite(mossAt(g, x))).toBe(true);
    }
    const [a, b, c] = g.bands;
    expect(a).toBeGreaterThan(150);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  }
});

test('the moss hill behind: cushions show over the floor, about RIDGE_RISE high, along part of it but not everywhere', () => {
  for (const src of [...TEXTS, ...Array.from({ length: 60 }, (_, i) => `line ${i} ${'ölk'.repeat(i)}`)]) {
    const g = readGround(src);
    let over = 0;
    let n = 0;
    for (let x = WORLD.x0; x <= WORLD.x1; x += 3, n++) {
      const d = ridgeAt(g, x) - heightAt(g, x);
      expect(Number.isFinite(d)).toBe(true);
      expect(d).toBeLessThan(RIDGE_RISE * 1.5);
      if (d > 0) over++;
    }
    expect(over / n).toBeGreaterThan(0.4);
    expect(over / n).toBeLessThan(0.9);
    // every big cushion inside the world shows its top (the small ones between them may stay behind the floor)
    for (const [c, wl] of g.ridge)
      if (wl >= 170 && c > WORLD.x0 && c < WORLD.x1) expect(ridgeAt(g, c) - heightAt(g, c)).toBeGreaterThan(RIDGE_RISE * 0.6);
  }
});

test('the same text, the same ground; an edit eases from one ground into the other', () => {
  const a = readGround('under the spruces');
  const b = readGround('under the spruces!');
  expect(readGround('under the spruces')).toEqual(a);
  expect(b).not.toEqual(a);
  expect(mixGround(a, b, 0)).toEqual(a);
  expect(mixGround(a, b, 1)).toEqual(b);
  const half = mixGround(a, b, 0.5);
  for (let x = WORLD.x0; x <= WORLD.x1; x += 50) expect(Number.isFinite(heightAt(half, x))).toBe(true);
});

test('buried things: a handful of different treasures, stones, inside the world, under the moss, none overlapping', () => {
  for (const src of [...TEXTS, ...Array.from({ length: 40 }, (_, i) => `dig ${i} ${'x'.repeat(i)}`)]) {
    const g = readGround(src);
    const { buried } = g;
    const treasure = buried.filter((b) => isTreasure(b.frame));
    expect(treasure.length).toBeGreaterThanOrEqual(4);
    expect(treasure.length).toBeLessThanOrEqual(TREASURE_MAX);
    expect(new Set(treasure.map((b) => b.frame)).size).toBe(treasure.length);
    expect(buried.length - treasure.length).toBeGreaterThan(40);
    expect(buried.length).toBeLessThanOrEqual(BURIED_MAX);
    for (const [i, b] of buried.entries()) {
      const r = reach(b.frame, b.scale);
      expect(b.x - r).toBeGreaterThanOrEqual(WORLD.x0);
      expect(b.x + r).toBeLessThanOrEqual(WORLD.x1);
      expect(b.depth - r).toBeGreaterThanOrEqual(150);
      expect(heightAt(g, b.x) - b.depth - r).toBeGreaterThan(WORLD.bottom);
      for (const o of buried.slice(i + 1)) expect(Math.hypot(o.x - b.x, o.depth - b.depth)).toBeGreaterThan(r + reach(o.frame, o.scale));
    }
  }
});

test('trees fill the world, neighbours differ, and the canopy fits the shaders: crowns drawn whole, back trees first', () => {
  for (const src of [...TEXTS, ...Array.from({ length: 60 }, (_, i) => `grove ${i} ${'y'.repeat(i)}`)]) {
    const { trees, crown } = readGround(src);
    expect(trees.length).toBeGreaterThanOrEqual(TREES_MIN);
    expect(trees.length).toBeLessThanOrEqual(TREES_MAX);
    const slot = (WORLD.x1 - WORLD.x0) / trees.length;
    expect(trees[0]!.x - WORLD.x0).toBeLessThan(slot);
    expect(WORLD.x1 - trees.at(-1)!.x).toBeLessThan(slot);
    for (const [i, t] of trees.entries()) {
      expect(t.trunk).toBeGreaterThanOrEqual(0);
      expect(t.trunk).toBeLessThan(TRUNKS.length);
      if (i > 0) expect(t.x).toBeGreaterThan(trees[i - 1]!.x);
      if (i > 0) expect(t.leaves).not.toBe(trees[i - 1]!.leaves);
    }
    // no picture repeats within seven trees
    for (let i = 0; i + 7 <= trees.length; i++) expect(new Set(trees.slice(i, i + 7).map((t) => t.trunk)).size).toBe(7);
    expect(crown.pieces.length).toBeLessThanOrEqual(CROWN_PIECES);
    expect(crown.seasons.length).toBe(trees.length);
    // tree by tree from the back, each crown whole: the pieces behind its trunk, then at least one in front of it, each
    // group back to front; neighbours stand at different depths
    for (const [i, p] of crown.pieces.entries()) {
      expect(p.layer).toBeLessThan(LAYERS);
      const q = crown.pieces[i - 1];
      if (!q) continue;
      expect(trees[p.tree]!.depth).toBeLessThanOrEqual(trees[q.tree]!.depth);
      if (q.tree === p.tree && q.behind === p.behind) expect(p.layer).toBeGreaterThanOrEqual(q.layer);
      if (q.tree === p.tree) expect(q.behind || !p.behind).toBe(true);
    }
    for (let t = 0; t < trees.length; t++) expect(crown.pieces.some((p) => p.tree === t && !p.behind)).toBe(true);
    // each crown drawn whole: a tree's pieces follow each other
    const order = crown.pieces.map((p) => p.tree).filter((t, i, all) => t !== all[i - 1]);
    expect(new Set(order).size).toBe(trees.length);
    expect(order.length).toBe(trees.length);
    for (let i = 1; i < trees.length; i++) expect(Math.abs(trees[i]!.depth - trees[i - 1]!.depth)).toBeGreaterThan(0.25);
    // the canopy runs out of the world at both ends: a piece of each end tree reaches past the edge
    const [first, last] = [trees[0]!, trees.at(-1)!];
    expect(crown.pieces.some((p) => p.tree === 0 && first.x + (p.dx - p.left) * TREE_SCALE < WORLD.x0 - 100)).toBe(true);
    expect(crown.pieces.some((p) => p.tree === trees.length - 1 && last.x + (p.dx + p.right) * TREE_SCALE > WORLD.x1 + 100)).toBe(true);
  }
});
