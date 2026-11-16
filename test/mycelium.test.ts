import { expect, test } from 'bun:test';
import { heightAt, mixGround, mossAt, readGround, ridgeAt, RIDGE_RISE, WORLD } from '../src/modes/mycelium/ground';
import { BURIED_MAX, isTreasure, reach, TREASURE_MAX } from '../src/modes/mycelium/buried';

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
