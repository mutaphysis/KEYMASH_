// Measures MYCELIUM_'s renderer on the real GPU (headless Chromium, ANGLE on Metal): frame time per text and camera
// view, what each group of draws costs (left out, and by GPU timer queries), how many fragments it shades (overdraw,
// with heat maps) and so its cost per fragment (shader complexity), and what uniform overrides save. The browser
// side is scripts/perf/bench.ts, its GL instrumentation scripts/perf/gltrace.ts.
// Writes scripts/perf/out/<label>/: report.md (also printed), result.json, each view's frame and overdraw heat map,
// and with --trace a Chrome trace (open it in https://ui.perfetto.dev). --compare <label> adds the change against an
// earlier run. Usage: bun scripts/perf.ts --help   (first time: bunx playwright-core install chromium-headless-shell)
import { createServer } from 'vite';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { LADDER } from '../src/ui/budget';
import type { BenchOptions, BenchResult, DrawResult, GroupResult, ScenarioResult, Stat } from './perf/bench';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = `${ROOT}scripts/perf/out/`;

const HELP = `bun scripts/perf.ts [options]

  --text <src>       a text to measure (repeatable; default: the first demo)
  --demos            every demo of the mode
  --views <list>     home, wide, close (the floor), canopy, crowns (the top, at rest and zoomed out), soil
                     (default: home,wide,canopy,crowns)
  --size <WxH>       the stage in CSS pixels (default 1280x720)
  --dpr <n>          device pixel ratio (default 2; the renderer caps it at 2)
  --pixels <n>       the scene target's pixel budget (default ${LADDER[0]}, the desktop's; phones start at ${LADDER[3]})
  --frames <n>       frames per measurement (default 20)
  --rounds <n>       measurements per configuration (default 5)
  --timer-frames <n> frames timed by GPU queries (default 10)
  --set <spec>       a variant: uniforms overridden in every program that has them, e.g. "uHaze=0" or
                     "uPieceCount=0;uOwn=0,0" (repeatable; one variant runs by default: no canopy shade)
  --heatmaps         an overdraw heat map per group, not only the whole frame's
  --per-draw         leave out every draw on its own too (slow: a configuration per draw)
  --trace            record a Chrome trace (trace.json)
  --label <name>     the output folder's name (default: date and time)
  --compare <label>  add the change against an earlier run
  --swiftshader      software GL instead of the GPU (numbers say little about a real GPU)`;

const { values: a } = parseArgs({
  options: {
    text: { type: 'string', multiple: true },
    demos: { type: 'boolean' },
    views: { type: 'string', default: 'home,wide,canopy,crowns' },
    size: { type: 'string', default: '1280x720' },
    dpr: { type: 'string', default: '2' },
    pixels: { type: 'string', default: String(LADDER[0]) },
    frames: { type: 'string', default: '20' },
    rounds: { type: 'string', default: '5' },
    'timer-frames': { type: 'string', default: '10' },
    set: { type: 'string', multiple: true },
    heatmaps: { type: 'boolean' },
    'per-draw': { type: 'boolean' },
    trace: { type: 'boolean' },
    label: { type: 'string' },
    compare: { type: 'string' },
    swiftshader: { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  },
});
if (a.help) {
  console.log(HELP);
  process.exit(0);
}

/** "uPieceCount=0;uOwn=0,0" → { uPieceCount: [0], uOwn: [0, 0] } */
function overrides(spec: string): Record<string, number[]> {
  return Object.fromEntries(
    spec.split(';').map((s) => {
      const [name, values] = s.split('=');
      const v = (values ?? '').split(',').map(Number);
      if (!name || !v.length || v.some(Number.isNaN)) throw new Error(`--set ${spec}: expected name=number[,number…]`);
      return [name.trim(), v];
    }),
  );
}

const [w, h] = a.size.split('x').map(Number) as [number, number];
const dpr = Number(a.dpr);
const opts: BenchOptions = {
  texts: [...(a.demos ? ['demo:*'] : []), ...(a.text ?? [])],
  views: a.views.split(','),
  w,
  h,
  pixels: Number(a.pixels),
  frames: Number(a.frames),
  rounds: Number(a.rounds),
  timerFrames: Number(a['timer-frames']),
  // the canopy's shade loops (shaders/crown.glsl) run in every program but the sky's and the buried things'
  variants: a.set?.length
    ? Object.fromEntries(a.set.map((s) => [s, overrides(s)]))
    : { 'no canopy shade (uPieceCount=0;uOwn=0,0)': overrides('uPieceCount=0;uOwn=0,0') },
  heatmaps: !!a.heatmaps,
  perDraw: !!a['per-draw'],
};
if (!opts.texts.length) opts.texts = ['demo:0'];

const label = a.label ?? new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
const dir = `${OUT}${label}/`;
let baseline: BenchResult | undefined;
if (a.compare) {
  const f = `${OUT}${a.compare}/result.json`;
  if (!existsSync(f)) throw new Error(`--compare ${a.compare}: no ${f}`);
  baseline = JSON.parse(readFileSync(f, 'utf8')) as BenchResult;
}
mkdirSync(dir, { recursive: true });

const server = await createServer({
  root: ROOT,
  configFile: false,
  logLevel: 'warn',
  plugins: [vanillaExtractPlugin()],
  define: { __APP_VERSION__: '"perf"', __GIT_SHA__: '"perf"', __BUILD_NUMBER__: '""', __BUILD_TIME__: '""' },
  // cross-origin isolated: performance.now() to 5 µs instead of 100
  server: { port: 0, headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' } },
});
await server.listen();
const gpuArgs =
  process.platform === 'darwin'
    ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
    : ['--enable-gpu', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args: a.swiftshader ? [] : gpuArgs });
let result: BenchResult;
try {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, locale: 'en-US' });
  page.on('pageerror', (e) => console.error(e));
  page.on('console', (m) => {
    if (m.text().startsWith('perf:')) console.log(m.text());
    else if (m.type() === 'error') console.error(m.text());
  });
  await page.goto(server.resolvedUrls!.local[0] + 'scripts/perf/');
  await page.waitForFunction(() => 'bench' in window);
  if (a.trace)
    await browser.startTracing(page, {
      path: dir + 'trace.json',
      categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'toplevel', 'v8.execute', 'blink', 'gpu', 'viz'],
    });
  result = await page.evaluate((o) => window.bench(o), opts);
  if (a.trace) await browser.stopTracing();
} finally {
  await browser.close();
  await server.close();
}

// pictures out of the result, into files
const files = new Map<ScenarioResult, Record<string, string>>();
result.scenarios.forEach((s, i) => {
  const mine: Record<string, string> = {};
  for (const [name, url] of Object.entries(s.images)) {
    const [head, data] = url.split(',') as [string, string];
    const file = `${i}-${s.view}-${name}.${head.includes('png') ? 'png' : 'jpg'}`;
    writeFileSync(dir + file, Buffer.from(data, 'base64'));
    mine[name] = file;
  }
  files.set(s, mine);
  s.images = mine;
});
writeFileSync(dir + 'result.json', JSON.stringify(result, null, 1));

const ms = (v: number | null | undefined) => (v == null ? '–' : v.toFixed(2));
const signed = (v: number, d = 2) => (v >= 0 ? '+' : '') + v.toFixed(d);
const pct = (v: number) => `${Math.round(100 * v)} %`;
const short = (t: string) => JSON.stringify(t.length > 36 ? t.slice(0, 35) + '…' : t).replace(/\\n/g, '⏎');
const same = (x: ScenarioResult) => baseline?.scenarios.find((y) => y.text === x.text && y.view === x.view);
/** the timer queries can be believed: their sum is near the frame's wall time. On a tiled GPU (Apple) each query ends
 * the render pass, so every timed draw also pays for storing and reloading the target, and the sum balloons */
const trusted = (s: ScenarioResult) => s.gpuSum != null && s.gpuSum < 1.5 * s.frame.ms;
/** what a group costs: the timer's number where it can be believed, else what leaving it out saves */
const cost = (s: ScenarioResult, g: GroupResult): Stat => (trusted(s) && g.gpu != null ? { ms: g.gpu, spread: 0 } : g.ablate);
/** a saving is noise when it is within three median deviations of nothing, within the jitter between neighbouring
 * measurements of the base, or under 1 % of the frame (0.03 ms at least) */
const real = (s: ScenarioResult, c: Stat) => Math.abs(c.ms) >= Math.max(3 * c.spread, s.jitter, 0.01 * s.frame.ms, 0.03);
/** a saving: leaving something out can't make the frame slower, so a negative one is noise as well */
const shown = (s: ScenarioResult, c: Stat) => (c.ms > 0 && real(s, c) ? ms(c.ms) : '~0');
const costliest = (s: ScenarioResult) =>
  s.groups.filter((g) => g.draws && g.group !== 'scene target').sort((x, y) => cost(s, y).ms - cost(s, x).ms)[0];
const timers = (s: ScenarioResult) => (s.gpuSum == null ? '–' : `${ms(s.gpuSum)}${trusted(s) ? '' : ' (split)'}`);
/** a draw's cost, where it was measured: left out on its own (--per-draw), else its timer if believable */
const drawCost = (s: ScenarioResult, d: DrawResult): Stat | null =>
  d.ablate ?? (trusted(s) && d.gpu != null ? { ms: d.gpu, spread: 0 } : null);

const out: string[] = [];
out.push(
  `# MYCELIUM_ perf · ${label}`,
  '',
  `${result.gpu} · timer queries: ${result.timer ? 'yes' : 'no'} · stage ${w}×${h} CSS px at dpr ${dpr} · budget ${opts.pixels} px · ` +
    `${opts.frames} frames × ${opts.rounds} rounds${baseline ? ` · compared with ${a.compare}` : ''}`,
  '',
  `Renderer built and pictures uploaded in ${ms(result.setup)} ms, first frame ${ms(result.firstFrame)} ms.`,
  '',
  '| scenario | frame ms | ± | fps | ' + (baseline ? 'Δ ms | ' : '') + 'CPU ms | counting ms | GPU timers ms | costliest |',
  '|---|--:|--:|--:|' + (baseline ? '--:|' : '') + '--:|--:|--:|---|',
);
for (const s of result.scenarios) {
  const b = same(s);
  const c = costliest(s);
  out.push(
    `| ${s.view} · ${short(s.text)} | ${ms(s.frame.ms)} | ${ms(s.frame.spread)} | ${Math.round(1000 / s.frame.ms)} | ` +
      (baseline
        ? `${b ? `${signed(s.frame.ms - b.frame.ms)} (${signed((100 * (s.frame.ms - b.frame.ms)) / b.frame.ms, 0)} %)` : '–'} | `
        : '') +
      `${ms(s.cpu)} | ${ms(s.counting.ms)} | ${timers(s)} | ${c ? `${c.group} ${shown(s, cost(s, c))}` : '–'} |`,
  );
}
out.push(
  '',
  'frame: wall time per frame, frames back to back (GPU bound), median and median deviation over rounds. CPU: one ' +
    'frame() call. counting: every fragment shader swapped for one that only counts: raster, blend and vertex work ' +
    'without shading. GPU timers: the per-draw queries summed; (split): far above frame, the queries split the ' +
    "GPU's work (a tiled GPU ends its render pass at each), so their numbers are left out and costs come from ablate.",
);

for (const s of result.scenarios) {
  const b = same(s);
  const img = files.get(s)!;
  const [tw, th] = s.target;
  const gpuCol = trusted(s);
  out.push(
    '',
    `## ${s.view} · ${short(s.text)}`,
    '',
    `canvas ${s.canvas.join('×')}, scene target ${tw}×${th} (${((tw * th) / 1e6).toFixed(2)} MP) · frame **${ms(s.frame.ms)} ms** ±${ms(s.frame.spread)}` +
      (b ? ` (${signed(s.frame.ms - b.frame.ms)} ms)` : '') +
      ` · CPU ${ms(s.cpu)} · counting ${ms(s.counting.ms)} · GPU timers ${timers(s)} · jitter ${ms(s.jitter)}`,
    '',
    '| group | draws | tris | ' +
      (gpuCol ? 'GPU ms | ' : '') +
      'ablate ms | share | ' +
      (b ? 'Δ ms | ' : '') +
      'frags M | overdraw | covered | deepest | ns/frag |',
    '|---|--:|--:|' + (gpuCol ? '--:|' : '') + '--:|--:|' + (b ? '--:|' : '') + '--:|--:|--:|--:|--:|',
  );
  for (const g of s.groups) {
    const old = b?.groups.find((x) => x.group === g.group);
    const target = g.group === 'scene target';
    const c = cost(s, g);
    const priced = !target && c.ms > 0 && real(s, c);
    const was = b && old && cost(b, old);
    const delta = was && { ms: c.ms - was.ms, spread: Math.max(c.spread, was.spread) };
    out.push(
      `| ${g.group} | ${g.draws} | ${target ? '' : Math.round(g.tris)} | ` +
        (gpuCol ? `${target ? '' : ms(g.gpu)} | ` : '') +
        `${target ? '' : shown(s, g.ablate)} | ${priced ? pct(c.ms / s.frame.ms) : ''} | ` +
        (b ? `${delta && !target && real(s, delta) ? signed(delta.ms) : ''} | ` : '') +
        `${(g.fragments / 1e6).toFixed(2)} | ${(g.fragments / g.pixels).toFixed(2)}× | ${pct(g.covered / g.pixels)} | ${g.deepest} | ` +
        `${priced && g.fragments ? ((c.ms * 1e6) / g.fragments).toFixed(2) : ''} |`,
    );
  }
  if (s.variants.length) {
    out.push('', '| variant | frame ms | Δ ms | Δ |', '|---|--:|--:|--:|');
    for (const v of s.variants)
      out.push(
        `| ${v.name} | ${ms(v.frame.ms)} | ${real(s, v.saving) ? signed(-v.saving.ms) : '~0'} | ` +
          `${real(s, v.saving) ? `${signed((-100 * v.saving.ms) / s.frame.ms, 0)} %` : ''} |`,
      );
  }
  // the draws that matter: by cost where it was measured, else by fragments
  const measured = s.draws.some((d) => drawCost(s, d) != null);
  const top = [...s.draws]
    .sort((x, y) => (measured ? (drawCost(s, y)?.ms ?? 0) - (drawCost(s, x)?.ms ?? 0) : y.fragments - x.fragments))
    .slice(0, 12)
    .filter((d) => d.fragments || drawCost(s, d));
  out.push(
    '',
    `costliest draws (${measured ? 'by cost' : 'by fragments: --per-draw measures their cost'}):`,
    '',
    '| draw | tris | frags M | overdraw | ' + (measured ? 'cost ms |' : ''),
    '|---|--:|--:|--:|' + (measured ? '--:|' : ''),
    ...top.map((d) => {
      const c = drawCost(s, d);
      return (
        `| ${d.draw} | ${Math.round(d.tris)} | ${(d.fragments / 1e6).toFixed(2)} | ${(d.fragments / d.pixels).toFixed(2)}× | ` +
        (measured ? `${c ? shown(s, c) : '–'} |` : '')
      );
    }),
  );
  out.push(
    '',
    Object.entries(img)
      .map(([name, f]) => `![${name}](${f})`)
      .join(' '),
  );
}
out.push(
  '',
  'ablate: how much faster the frame is without the group (~0: within noise). share: its cost (GPU timer if not ' +
    'split, else ablate) of the frame. overdraw: fragments per pixel of the target it draws into. covered: pixels it ' +
    'touches. deepest: most layers on one pixel. ns/frag: its cost per fragment, how heavy its shader is. Heat maps: ' +
    'black 0, deep blue 1, blue 2, green 4, yellow 8, red 16, white 32+ layers.',
);
const md = out.join('\n') + '\n';
writeFileSync(dir + 'report.md', md);
console.log('\n' + md);
console.log(`→ ${dir.replace(ROOT, '')}`);
if (/swiftshader/i.test(result.gpu)) console.warn('software rendering: these timings say little about a real GPU');
