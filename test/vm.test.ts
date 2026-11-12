import { test, expect } from 'bun:test';
import { VM, SPELLS, SPELL_COOLDOWN, BANNER_COOLDOWN, hash, tempoOf } from '../src/lang/vm';
import { graphemes } from '../src/lang/lexer';
import { lex, evalMath, fmtNum } from '../src/lang/lexer';
import type { VMEvent } from '../src/lang/types';

const POOL = [
  ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZäöüßÄÖÜ0123456789',
  ...'!?.,;:~-_|/\\*#@$%^+=<>&(){}[]`\'"“”«»…€£ \n\n\t',
  '🐶', '🐱', '🔥', '🌈', '💥', '❤️', '👨‍👩‍👧', '🇩🇪', '🐿️', '😵‍💫', 'é', 'ñ', '漢', '字', 'Ж', 'ي', '\u0000', '￿', '\uD800',
];

function randomProgram(rng: () => number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += POOL[Math.floor(rng() * POOL.length)];
  return s;
}

function rngFrom(seed: number): () => number {
  let a = seed;
  return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
}

function checkEvents(evs: VMEvent[]) {
  for (const e of evs) {
    const rec = e as unknown as Record<string, unknown>;
    for (const k of ['x', 'y', 'r', 'midi', 'size']) {
      if (k in rec) expect(Number.isFinite(rec[k])).toBe(true);
    }
    if (e.type === 'stroke') for (const [x, y] of e.pts) { expect(Number.isFinite(x)).toBe(true); expect(Number.isFinite(y)).toBe(true); }
  }
}

test('lexer never throws and covers every grapheme', () => {
  const rng = rngFrom(1);
  for (let i = 0; i < 500; i++) {
    const src = randomProgram(rng, Math.floor(rng() * 200));
    const L = lex(src);
    expect(L.gs.join('')).toBe(src);
  }
});

test('math', () => {
  expect(evalMath([2, 3, 4], ['+', '*'])).toBe(14);
  expect(evalMath([2, 3, 2], ['^', '^'])).toBe(512);
  expect(fmtNum(1 / 0)).toBe('∞');
  const L = lex('7*6= and 3x4');
  const m = L.lines[0]!.flatMap((t) => (t.t === 'math' ? [t] : []));
  expect(m.length).toBe(2);
  expect(m[0]!.value).toBe(42);
  expect(m[1]!.value).toBe(12);
});

test('fuzz: 150 random programs x 300 ticks, no exceptions, finite output', () => {
  const rng = rngFrom(42);
  let total = 0;
  for (let i = 0; i < 150; i++) {
    const src = randomProgram(rng, Math.floor(rng() * 300));
    const vm = new VM(src, { hw: 300, hh: 500 });
    for (let t = 0; t < 300; t++) {
      const ev = vm.tick();
      checkEvents(ev);
      total += ev.length;
      expect(vm.threads.length).toBeLessThanOrEqual(13);
    }
  }
  expect(total).toBeGreaterThan(1000);
}, 60000);

test('the VM never catches its own errors on random input (no SEGFAULT logs)', () => {
  const rng = rngFrom(7);
  for (let i = 0; i < 200; i++) {
    const vm = new VM(randomProgram(rng, 150));
    for (let t = 0; t < 200; t++) {
      for (const e of vm.tick()) if (e.type === 'log') expect(e.text.includes('SEGFAULT')).toBe(false);
    }
  }
});

test('every spell runs', () => {
  const vm = new VM('a');
  const th = vm.threads[0]!;
  for (const op of new Set(SPELLS)) {
    vm.ev = [];
    vm.keyword(th, op, 2);
    checkEvents(vm.ev);
  }
});

test('dog keysmash produces sound and visuals every tick', () => {
  const vm = new VM('jfkdlsaöä asdfghjkl JJJJJJJ kkkkkkkkkkkkk');
  let sound = 0, vis = 0;
  for (let t = 0; t < 64; t++) for (const e of vm.tick()) {
    if (['note', 'drum', 'sfx', 'say'].includes(e.type)) sound++;
    if (['stroke', 'shape', 'particles'].includes(e.type)) vis++;
  }
  expect(sound).toBeGreaterThan(40);
  expect(vis).toBeGreaterThan(40);
});

test('lines are parallel threads; brackets spawn; & forks', () => {
  const vm = new VM('abc\ndef\n[ghi] & xyz');
  expect(vm.threads.length).toBe(3);
  for (let t = 0; t < 10; t++) vm.tick();
  expect(vm.threads.length).toBeGreaterThan(3);
});

test('pathological inputs', () => {
  for (const src of ['', ' ', '\n\n\n', '((((((((', '))))))))', '()()()', '[[[[[[[[[[[]]]]]]]]', '&&&&&&&&&&&&&&&&&', ':::::', '""""', '"', '9'.repeat(400), '9^9^9^9', '0/0', 'a'.repeat(5000), '🐶'.repeat(300)]) {
    const vm = new VM(src);
    for (let t = 0; t < 200; t++) checkEvents(vm.tick());
  }
});

test('spell cooldowns: hacking at most every 4 s, other spells every 1.5 s, across all threads', () => {
  // every chunk on every line hammers the gate; we record when spells actually fire
  const vm = new VM('a\nb\nc');
  const fired: Record<string, number[]> = { hack: [], matrix: [], boom: [] };
  for (let t = 0; t < 480; t++) { // 60 s at 120 BPM
    vm.tick();
    for (const op of ['hack', 'matrix', 'boom'] as const) if (vm.cast(op)) fired[op]!.push(vm.time);
  }
  const hacking = [...fired.hack!, ...fired.matrix!].sort((a, b) => a - b);
  for (let i = 1; i < hacking.length; i++) expect(hacking[i]! - hacking[i - 1]!).toBeGreaterThanOrEqual(BANNER_COOLDOWN - 1e-6);
  expect(hacking.length).toBeGreaterThan(15); // and it does keep firing
  const booms = fired.boom!;
  for (let i = 1; i < booms.length; i++) expect(booms[i]! - booms[i - 1]!).toBeGreaterThanOrEqual(SPELL_COOLDOWN - 1e-6);
});

test('hacker banners from mashing respect the 4 s cooldown', () => {
  // find mash chunks whose spell is a hacker spell, and put lots of them on many lines
  const hacker = new Set(['hack', 'access', 'mainframe', 'virus', 'download', 'matrix']);
  const rng = rngFrom(99); const chunks: string[] = [];
  while (chunks.length < 12) {
    let w = ''; for (let i = 0; i < 6; i++) w += 'qwertzuiopasdfghjklyxcvbnm'[Math.floor(rng() * 26)];
    if (hacker.has(SPELLS[hash(w) % SPELLS.length]!)) chunks.push(w);
  }
  const src = Array.from({ length: 8 }, (_, i) => chunks.slice(i % 4, i % 4 + 6).join(' ')).join('\n');
  const vm = new VM(src);
  const banners: number[] = [];
  for (let t = 0; t < 480; t++) for (const e of vm.tick()) if (e.type === 'banner') banners.push(vm.time);
  expect(banners.length).toBeGreaterThan(10); // the program really is hacking all the time
  expect(banners.length).toBeLessThanOrEqual(Math.floor(vm.time / BANNER_COOLDOWN) + 1);
  for (let i = 1; i < banners.length; i++) expect(banners[i]! - banners[i - 1]!).toBeGreaterThanOrEqual(BANNER_COOLDOWN - 0.13);
});

test('the answer (42) shows at most every 4 s', () => {
  const vm = new VM('6*7=\n6*7=\n42-0=\n21+21=');
  const shown: number[] = [];
  for (let t = 0; t < 480; t++) for (const e of vm.tick()) if (e.type === 'banner' && e.text === 'THE ANSWER.') shown.push(vm.time);
  expect(shown.length).toBeGreaterThan(10);
  for (let i = 1; i < shown.length; i++) expect(shown[i]! - shown[i - 1]!).toBeGreaterThanOrEqual(BANNER_COOLDOWN - 0.13);
});

test('MATH.EXE crash banner (division by zero) shows at most every 4 s', () => {
  const vm = new VM('1/0=\n0/0=\n9^9^9^9=');
  const shown: number[] = [];
  for (let t = 0; t < 480; t++) for (const e of vm.tick()) if (e.type === 'banner' && e.text.startsWith('MATH.EXE')) shown.push(vm.time);
  expect(shown.length).toBeGreaterThan(10);
  for (let i = 1; i < shown.length; i++) expect(shown[i]! - shown[i - 1]!).toBeGreaterThanOrEqual(BANNER_COOLDOWN - 0.13);
});

test('tempo comes from the text: shouting is faster than calm, always 70..120', () => {
  const t = (src: string) => tempoOf(graphemes(src), hash(src));
  expect(t('AAAA!!! WOOF!!! JJJJJJJ!!!')).toBeGreaterThan(t('a . . . b . . . ~ ~ ~   c') + 20);
  expect(t('')).toBe(100);
  const rng = rngFrom(5);
  for (let i = 0; i < 300; i++) { const b = t(randomProgram(rng, 1 + Math.floor(rng() * 120))); expect(b).toBeGreaterThanOrEqual(70); expect(b).toBeLessThanOrEqual(120); }
  expect(new VM('asdf jkl').bpm).toBe(t('asdf jkl'));
});

test('no program ever runs faster than 120 BPM, whatever spells it casts', () => {
  const rng = rngFrom(11);
  for (let i = 0; i < 60; i++) {
    const vm = new VM(randomProgram(rng, 200));
    for (let t = 0; t < 300; t++) { vm.tick(); expect(vm.bpm).toBeLessThanOrEqual(120); }
  }
});

test('radar: at most once every 12 s', () => {
  const vm = new VM('a');
  const fired: number[] = [];
  for (let t = 0; t < 600; t++) { vm.tick(); if (vm.cast('radar')) fired.push(vm.time); }
  expect(fired.length).toBeGreaterThan(2);
  for (let i = 1; i < fired.length; i++) expect(fired[i]! - fired[i - 1]!).toBeGreaterThanOrEqual(12 - 1e-6);
});
