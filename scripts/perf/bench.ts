// Runs in the browser (scripts/perf/index.html, driven by scripts/perf.ts): MYCELIUM_'s real renderer on a canvas of
// its own, traced (gltrace.ts), measured per text and camera view:
//   frame     wall time per frame, frames sent back to back and waited for (GPU bound), median over rounds
//   ablate    the same with one group of draws left out: what that group costs, measured the robust way
//   gpu       timer queries around every draw (where the GPU has them): a cost per draw, but on a tiled GPU (Apple)
//             each query splits the render pass, so compare their sum with `frame` before trusting them
//   overdraw  every fragment shader swapped for one that just counts: fragments shaded per group, how many layers
//             deep, and the whole frame as a heat map; the counting frame's time is the raster-and-blend floor
//   variants  uniforms overridden (e.g. uPieceCount 0: no canopy shade loops) to price a shader feature
//   cpu       the JS time of one frame() call
// Draws are grouped by fragment shader (buried.frag by pass). The pixel budget is pinned, so nothing steps down.
import { DEMOS } from '../../src/modes/mycelium/demos';
import { fetchAssets, fetchTrunks } from '../../src/modes/mycelium/assets';
import { readGround } from '../../src/modes/mycelium/ground';
import { ForestRenderer, PASS } from '../../src/modes/mycelium/render';
import * as SHADERS from '../../src/modes/mycelium/shaders';
import { PixelBudget } from '../../src/ui/budget';
import { traced } from './gltrace';
import type { Draw, GLTrace } from './gltrace';

/** simulated seconds per frame */
const DT = 1 / 60;
/** frames drawn before measuring anything: shaders compiled, textures resident, the GPU clocked up */
const WARM = 5;
/** configurations measured between two measurements of the base */
const BASE_EVERY = 3;

export interface BenchOptions {
  /** 'demo:N' (demos.ts), 'demo:*' (all of them) or the text itself */
  texts: string[];
  views: string[];
  /** the stage in CSS pixels */
  w: number;
  h: number;
  /** the scene target's pixel budget (src/ui/budget.ts) */
  pixels: number;
  /** frames per measurement, measurements per configuration, frames timed by queries */
  frames: number;
  rounds: number;
  timerFrames: number;
  /** name → uniform overrides */
  variants: Record<string, Record<string, number[]>>;
  /** a heat map per group, not only the whole frame's */
  heatmaps: boolean;
  /** leave out every draw on its own too, not only every group (slow: a configuration per draw) */
  perDraw: boolean;
}

/** median milliseconds and the median absolute deviation around it */
export interface Stat {
  ms: number;
  spread: number;
}

export interface GroupResult {
  group: string;
  draws: number;
  tris: number;
  /** timer queries: median ms per frame, null without them */
  gpu: number | null;
  /** how much faster the frame is without it, and how much that varies */
  ablate: Stat;
  /** fragments shaded, pixels covered at least once, the most layers anywhere, and the pixels of the target it draws
   * into */
  fragments: number;
  covered: number;
  deepest: number;
  pixels: number;
}

export interface DrawResult {
  draw: string;
  tris: number;
  /** timer queries, median ms */
  gpu: number | null;
  /** how much faster the frame is without it (only with perDraw) */
  ablate: Stat | null;
  /** fragments shaded, and the pixels of the target it draws into */
  fragments: number;
  pixels: number;
}

export interface ScenarioResult {
  text: string;
  view: string;
  canvas: [number, number];
  target: [number, number];
  frame: Stat;
  /** how far two neighbouring measurements of the base lie apart (median): below it, a saving is noise */
  jitter: number;
  cpu: number;
  /** the frame with every fragment shader counting instead: raster, blend and vertex work, no shading */
  counting: Stat;
  /** the timer queries' sum, median per frame */
  gpuSum: number | null;
  groups: GroupResult[];
  /** each variant's frame, and what it saves against the base measured around it */
  variants: { name: string; frame: Stat; saving: Stat }[];
  /** every draw, `group#n` */
  draws: DrawResult[];
  /** name → data URL */
  images: Record<string, string>;
}

export interface BenchResult {
  gpu: string;
  timer: boolean;
  /** a renderer built (its programs linked) and its pictures uploaded */
  setup: number;
  /** its first frame: what the driver left for first use (Metal finishes programs then), the trunks' textures */
  firstFrame: number;
  scenarios: ScenarioResult[];
}

/** where the camera looks: set on a renderer whose ground is set. frame() clamps the camera to the world, so ±Infinity
 * is the world's top or bottom edge */
const VIEWS: Record<string, (r: ForestRenderer) => void> = {
  // the floor where RUN shows it, at rest, zoomed out, and up close
  home: (r) => look(r, 1),
  wide: (r) => look(r, 0.5),
  close: (r) => look(r, 2.5),
  // up in the crowns, at rest and zoomed out (all of them at once: the most canopy there is to draw)
  canopy: (r) => look(r, 1, Infinity),
  crowns: (r) => look(r, 0.5, Infinity),
  // down at the world's bottom
  soil: (r) => look(r, 1, -Infinity),
};

function look(r: ForestRenderer, zoom: number, y?: number): void {
  r.zoom = zoom;
  r.home();
  if (y !== undefined) r.cam.y = y;
}

const NAMES = new Map(
  Object.entries(SHADERS)
    .filter((e): e is [string, string] => e[0].endsWith('_FS') && typeof e[1] === 'string')
    .map(([k, src]) => [src, k.slice(0, -3).toLowerCase()]),
);
const PASS_NAMES = Object.fromEntries(Object.entries(PASS).map(([k, v]) => [v, k]));
const group = (program: string, ints: Readonly<Record<string, number>>) =>
  program === 'buried' ? `buried.${PASS_NAMES[ints.uPass ?? 0]}` : program;

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const stat = (a: number[]): Stat => {
  const ms = median(a);
  return { ms, spread: median(a.map((v) => Math.abs(v - ms))) };
};

interface Rig {
  r: ForestRenderer;
  trace: GLTrace;
  cv: HTMLCanvasElement;
}

function rig(o: BenchOptions): Rig {
  const cv = document.createElement('canvas');
  cv.style.cssText = `position:absolute;left:0;top:0;width:${o.w}px;height:${o.h}px`;
  document.body.append(cv);
  const { value: r, trace } = traced({ names: NAMES, group }, () => new ForestRenderer(cv));
  if (!r.ok) throw new Error('no WebGL2');
  // a single rung: the target keeps its size however slow frames get (budget is private; TS only)
  const pinned = r as unknown as { budget: PixelBudget };
  if (!(pinned.budget instanceof PixelBudget)) throw new Error('ForestRenderer has no budget field any more: update scripts/perf/bench.ts');
  pinned.budget = new PixelBudget([o.pixels]);
  r.resize(o.w, o.h);
  return { r, trace, cv };
}

/** one frame; its draws */
function once({ r, trace }: Rig): Draw[] {
  trace.begin();
  r.frame(DT);
  return trace.draws;
}

/** ms per frame, frames sent back to back, then waited for */
function wall(rig: Rig, frames: number): number {
  for (let i = 0; i < 2; i++) once(rig);
  rig.trace.sync();
  const t0 = performance.now();
  for (let i = 0; i < frames; i++) once(rig);
  rig.trace.sync();
  return (performance.now() - t0) / frames;
}

/** overdraw heat: 0 black, 1 deep blue, 2 blue, 4 green, 8 yellow, 16 red, 32 and more white */
const STOPS: [number, [number, number, number]][] = [
  [0, [0, 0, 0]],
  [1, [20, 30, 140]],
  [2, [0, 120, 220]],
  [4, [0, 190, 90]],
  [8, [250, 210, 0]],
  [16, [230, 40, 20]],
  [32, [255, 255, 255]],
];
const HEAT = Array.from({ length: 256 }, (_, n) => {
  const i = Math.max(0, STOPS.findIndex(([at]) => at >= n) - 1);
  const [a, ca] = STOPS[i]!;
  const [b, cb] = STOPS[Math.min(i + 1, STOPS.length - 1)]!;
  const t = b > a ? Math.min(1, (n - a) / (b - a)) : 1;
  return ca.map((c, k) => Math.round(c + (cb[k]! - c) * t));
});

function heatmap(w: number, h: number, px: Uint8Array): string {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  const img = x.createImageData(w, h);
  for (let y = 0; y < h; y++)
    for (let i = 0; i < w; i++) {
      const rgb = HEAT[px[((h - 1 - y) * w + i) * 4]!]!;
      const o = (y * w + i) * 4;
      img.data[o] = rgb[0]!;
      img.data[o + 1] = rgb[1]!;
      img.data[o + 2] = rgb[2]!;
      img.data[o + 3] = 255;
    }
  x.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

/** fragments, covered pixels and the deepest stack in a counted target */
function counted(px: Uint8Array): { fragments: number; covered: number; deepest: number } {
  let fragments = 0;
  let covered = 0;
  let deepest = 0;
  for (let i = 0; i < px.length; i += 4) {
    const n = px[i]!;
    fragments += n;
    if (n) covered++;
    if (n > deepest) deepest = n;
  }
  return { fragments, covered, deepest };
}

async function scenario(o: BenchOptions, main: Rig, text: string, view: string): Promise<ScenarioResult> {
  VIEWS[view]!(main.r);
  for (let i = 0; i < WARM; i++) main.r.frame(DT);
  main.trace.sync();

  // the draws, and the picture they make (read before the task ends: the canvas isn't preserved)
  const draws = once(main);
  const images: Record<string, string> = { scene: main.cv.toDataURL('image/jpeg', 0.85) };
  const groups = [...new Set(draws.map((d) => d.group))];
  const scene = draws.find((d) => d.fbo)?.fbo ?? null;
  const [tw, th] = main.trace.sizes.get(scene) ?? [1, 1];

  // CPU: one frame() call at a time, the GPU idle before it
  const cpu: number[] = [];
  for (let i = 0; i < o.frames; i++) {
    main.trace.sync();
    const t0 = performance.now();
    once(main);
    cpu.push(performance.now() - t0);
  }

  // wall time. The GPU's clock drifts over a run (heat, power states), so every configuration is paired with the base
  // measured around it: the base first, then again after every BASE_EVERY configurations. What a configuration saves
  // is the base interpolated to when it ran minus its own time; median over rounds
  const labels = draws.map((d) => `${d.group}#${d.n}`);
  type Config = { name: string; skip?: string; set?: Record<string, number[]>; counting?: boolean };
  const configs: Config[] = [
    ...groups.map((g) => ({ name: 'skip ' + g, skip: g })),
    ...(o.perDraw ? labels.map((l) => ({ name: 'skip ' + l, skip: l })) : []),
    ...Object.entries(o.variants).map(([name, set]) => ({ name, set })),
    { name: 'counting', counting: true },
  ];
  const measure = (c?: Config) => {
    main.trace.skip = new Set(c?.skip ? [c.skip] : []);
    main.trace.overrides = c?.set ?? {};
    main.trace.counting = !!c?.counting;
    const ms = wall(main, o.frames);
    main.trace.skip = new Set();
    main.trace.overrides = {};
    main.trace.counting = false;
    return ms;
  };
  const bases: number[] = [];
  /** how far two neighbouring measurements of the base lie apart: the noise a paired saving carries (the drift over
   * the whole run, which pairing removes, stays out of it) */
  const steps: number[] = [];
  const times = new Map<string, number[]>(configs.map((c) => [c.name, []]));
  const saved = new Map<string, number[]>(configs.map((c) => [c.name, []]));
  for (let round = 0; round < o.rounds; round++) {
    let before = measure();
    bases.push(before);
    for (let i = 0; i < configs.length; i += BASE_EVERY) {
      const chunk = configs.slice(i, i + BASE_EVERY);
      const ms = chunk.map((c) => measure(c));
      const after = measure();
      bases.push(after);
      steps.push(Math.abs(after - before));
      chunk.forEach((c, k) => {
        times.get(c.name)!.push(ms[k]!);
        saved.get(c.name)!.push(before + ((after - before) * (k + 1)) / (chunk.length + 1) - ms[k]!);
      });
      before = after;
    }
  }
  const base = stat(bases);
  /** what leaving out (or changing) `name` saves, and how much that varies */
  const saving = (name: string) => stat(saved.get(name)!);
  /** the frame time with `name` */
  const frameWith = (name: string) => stat(times.get(name)!);

  // timer queries per draw
  const gpu = new Map<string, number[]>();
  const gpuDraw = new Map<string, number[]>();
  const sums: number[] = [];
  if (main.trace.timer) {
    main.trace.timing = true;
    for (let k = 0, tries = 0; k < o.timerFrames && tries < 3 * o.timerFrames; tries++) {
      const d = once(main);
      const ns = await main.trace.times(d);
      if (!ns) continue; // disjoint: try again
      k++;
      const frame = new Map<string, number>();
      d.forEach((x, i) => {
        frame.set(x.group, (frame.get(x.group) ?? 0) + ns[i]! / 1e6);
        const label = `${x.group}#${x.n}`;
        gpuDraw.set(label, [...(gpuDraw.get(label) ?? []), ns[i]! / 1e6]);
      });
      for (const [g, ms] of frame) gpu.set(g, [...(gpu.get(g) ?? []), ms]);
      sums.push(ns.reduce((s, v) => s + v, 0) / 1e6);
    }
    main.trace.timing = false;
  }

  // overdraw: each group alone, each draw alone, then everything
  main.trace.counting = true;
  const results: GroupResult[] = groups.map((g) => {
    main.trace.only = new Set([g]);
    const d = once(main);
    const fbo = d[0]?.fbo ?? null;
    const { w, h, px } = main.trace.read(fbo);
    if (o.heatmaps) images[`overdraw-${g}`] = heatmap(w, h, px);
    const mine = draws.filter((x) => x.group === g);
    const t = gpu.get(g);
    return {
      group: g,
      draws: mine.length,
      tris: mine.reduce((s, x) => s + (x.mode === WebGL2RenderingContext.TRIANGLES ? x.count / 3 : 0), 0),
      gpu: t ? median(t) : null,
      ablate: saving('skip ' + g),
      ...counted(px),
      pixels: w * h,
    };
  });
  const perDraw: DrawResult[] = labels.map((l, i) => {
    main.trace.only = new Set([l]);
    once(main);
    const t = gpuDraw.get(l);
    const { w, h, px } = main.trace.read(draws[i]!.fbo);
    return {
      draw: l,
      tris: draws[i]!.mode === WebGL2RenderingContext.TRIANGLES ? draws[i]!.count / 3 : 0,
      gpu: t ? median(t) : null,
      ablate: o.perDraw ? saving('skip ' + l) : null,
      fragments: counted(px).fragments,
      pixels: w * h,
    };
  });
  main.trace.only = null;
  once(main);
  const all = main.trace.read(scene);
  main.trace.counting = false;
  images.overdraw = heatmap(all.w, all.h, all.px);
  results.push({
    group: 'scene target',
    draws: draws.filter((d) => d.fbo === scene).length,
    tris: 0,
    gpu: null,
    ablate: { ms: 0, spread: 0 },
    ...counted(all.px),
    pixels: all.w * all.h,
  });

  return {
    text,
    view,
    canvas: [main.cv.width, main.cv.height],
    target: [tw, th],
    frame: base,
    jitter: median(steps),
    cpu: median(cpu),
    counting: frameWith('counting'),
    gpuSum: sums.length ? median(sums) : null,
    groups: results,
    variants: Object.keys(o.variants).map((name) => ({ name, frame: frameWith(name), saving: saving(name) })),
    draws: perDraw,
    images,
  };
}

async function bench(o: BenchOptions): Promise<BenchResult> {
  for (const view of o.views) if (!VIEWS[view]) throw new Error(`unknown view ${view}: ${Object.keys(VIEWS).join(', ')}`);
  const assets = await fetchAssets();
  const t0 = performance.now();
  const main = rig(o);
  main.r.upload(assets);
  const setup = performance.now() - t0;
  const info = main.trace.gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = info ? String(main.trace.gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  let firstFrame = -1;
  const scenarios: ScenarioResult[] = [];
  const texts = o.texts.flatMap((spec) => {
    if (spec === 'demo:*') return DEMOS.map((d) => d.src);
    const m = /^demo:(\d+)$/.exec(spec);
    return [m ? (DEMOS[+m[1]!]?.src ?? '') : spec];
  });
  for (const text of texts) {
    const g = readGround(text);
    const trunks = await fetchTrunks(g.trees.map((t) => t.trunk));
    main.r.addTrunks(trunks);
    main.r.setGround(g, true);
    main.r.home();
    if (firstFrame < 0) {
      const t1 = performance.now();
      main.r.frame(DT);
      main.trace.sync();
      firstFrame = performance.now() - t1;
    }
    for (const view of o.views) {
      console.log(`perf: ${JSON.stringify(text.slice(0, 40))} · ${view}`);
      scenarios.push(await scenario(o, main, text, view));
    }
  }
  return { gpu, timer: !!main.trace.timer, setup, firstFrame, scenarios };
}

declare global {
  interface Window {
    bench: typeof bench;
  }
}
window.bench = bench;
