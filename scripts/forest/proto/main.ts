// FOREST_ look prototype: generated cut-outs stacked in depth layers and blended into the haze by a shader,
// a mycelium that grows in the soil and carries nutrient pulses to the mushrooms it raises,
// a crawling snail (shader wave) and bugs whose legs and antennae are drawn procedurally.
// Runs from the gitignored samples: bun scripts/forest/proto.ts (see the README).

import { Gl, type Tex, type Theme } from './gl';

const W = 1280,
  H = 720,
  GROUND = 440;
const S = '/samples/';

/** The ground is a curve, not a line: gentle swells, a mound under the stump, a dip on the left. */
const groundAt = (x: number) =>
  GROUND +
  16 * Math.sin(x * 0.0045 + 1.2) +
  9 * Math.sin(x * 0.013 + 0.4) -
  46 * Math.exp(-(((x - 960) / 170) ** 2)) +
  24 * Math.exp(-(((x - 420) / 140) ** 2));
const slopeAt = (x: number) => Math.atan2(groundAt(x + 4) - groundAt(x - 4), 8);
/** A farther ridge, seen through the haze between the trunk layers. */
const ridgeAt = (x: number) => GROUND - 34 + 22 * Math.sin(x * 0.003 + 2.5) + 12 * Math.sin(x * 0.009);

// Seeded, so captures are repeatable.
let seed = 7;
const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const range = (a: number, b: number) => a + (b - a) * rnd();

const canvas = document.querySelector('canvas')!;
const gl = new Gl(canvas);
gl.view = [W, H];
gl.ground = GROUND;

function fit(): void {
  const dpr = Math.min(2, devicePixelRatio);
  const k = Math.min(innerWidth / W, innerHeight / H);
  canvas.style.width = `${W * k}px`;
  canvas.style.height = `${H * k}px`;
  canvas.width = Math.round(W * k * dpr);
  canvas.height = Math.round(H * k * dpr);
}
fit();
addEventListener('resize', fit);

async function load(path: string, crop = true): Promise<Tex> {
  const img = new Image();
  img.src = S + path;
  await img.decode();
  return gl.texture(img, crop);
}
/** All cells of a sliced sheet, however many the slicer found. */
async function cells(dir: string, prefix: string, crop = true): Promise<Tex[]> {
  const out: Tex[] = [];
  for (let i = 0; i < 32; i++) {
    try {
      out.push(await load(`${dir}/${prefix}-${String(i).padStart(2, '0')}.png`, crop));
    } catch {
      break;
    }
  }
  return out;
}

// Cut-outs come from the local matting (matte/matte.py: mask + background taken out of the edges) when
// they exist, else from Replicate's remover. Woody things are the broken-off ones from step 9.
const C = '10-cut/';
// ?graded: the neutral-graded singles (matte.py grade: the shared warm cast taken out, the set aligned).
const params = new URLSearchParams(location.search);
const G = params.has('graded') ? C + 'graded/' : C;
async function loadRibbon(path: string): Promise<Tex> {
  const img = new Image();
  img.src = S + path;
  await img.decode();
  return gl.ribbonTexture(img);
}
const [trunks, snags, snailT, stump, log, roots, rock, glowM, paleM] = await Promise.all([
  load(G + 'trunks-tall.png'),
  load(G + 'snags.png'),
  load(G + 'snail-nano-banana-2.png'),
  load(G + 'stump.png'),
  load(G + 'log.png'),
  load(G + 'roots-seedream-5-lite.png'),
  load(G + 'rock-seedream-5-lite.png'),
  load(G + 'glow-seedream-5-lite.png'),
  load(G + 'pale-seedream-5-lite.png'),
]);
// The library's first ground strip: the same humus as the soil textures below it (?strip=old: the step-10 strip).
const ground = await loadRibbon(params.get('strip') === 'old' ? G + 'ground.png' : 'pack/tex-ground.webp');
// The library's soils (samples/pack, matte/pack.py), hex-tiled below the ground; ?soil=flat keeps the old gradient.
async function loadSoils(): Promise<WebGLTexture | undefined> {
  if (params.get('soil') === 'flat') return undefined;
  try {
    const imgs = await Promise.all(
      [0, 1, 2, 3].map(async (i) => {
        const r = await fetch(`${S}pack/tex-soil-${i}.webp`);
        if (!r.ok) throw new Error(r.statusText);
        return createImageBitmap(await r.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      }),
    );
    return gl.soilTextures(imgs);
  } catch {
    return undefined;
  }
}
const soils = await loadSoils();
// Growth frames share one cell with the subject on its bottom centre: no cropping, or they'd jump.
const grow = [
  await cells(C + 'cells/mushroom-grow-nano-banana-2', 'cell', false),
  await cells(C + 'cells/mushroom-grow-seedream-5-lite', 'cell', false),
];
const variety = await cells(C + 'cells/mushroom-variety-nano-banana-2', 'cell');
const bodies = await cells(C + 'cells/bodies-side', 'cell');

/** The trunk sheet is four trunks side by side, joined by a moss band at the roots, so the slicer's
 * gutters don't exist there: split at the emptiest columns of the upper three quarters instead. */
async function splitColumns(path: string, n: number): Promise<[number, number, number, number][]> {
  const img = new Image();
  img.src = S + path;
  await img.decode();
  const c = new OffscreenCanvas(img.width, img.height);
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, img.width, img.height).data;
  const col = new Float32Array(img.width);
  for (let y = 0; y < img.height * 0.75; y += 2) for (let x = 0; x < img.width; x++) col[x]! += px[(y * img.width + x) * 4 + 3]!;
  const cuts = [0];
  for (let k = 1; k < n; k++) {
    let best = 0,
      at = 0;
    for (let x = Math.floor(img.width * (k / n - 0.1)); x < img.width * (k / n + 0.1); x++)
      if (at === 0 || col[x]! < best) {
        best = col[x]!;
        at = x;
      }
    cuts.push(at);
  }
  cuts.push(img.width);
  return cuts.slice(0, -1).map((x0, i) => [x0 / img.width, 0, cuts[i + 1]! / img.width, 1]);
}
const trunkCells = await splitColumns(G + 'trunks-tall.png', 4);
const snagCells = await splitColumns(G + 'snags.png', 4);
const trunkCell = (i: number) => trunkCells[i]!;

// ---- the backdrop: trunks at three depths ---------------------------------------------------------------

type Prop = {
  t: Tex;
  x: number;
  y: number;
  h: number;
  fog: number;
  blur: number;
  par: number;
  bright: number;
  cell?: [number, number, number, number];
  flip: boolean;
  sway: number;
};
const props: Prop[] = [];
const layer = (n: number, depth: { y: number; h: [number, number]; fog: number; blur: number; par: number; bright: number }) => {
  for (let i = 0; i < n; i++)
    props.push({
      t: trunks,
      cell: trunkCell(Math.floor(rnd() * 4)),
      x: ((i + range(0.1, 0.9)) / n) * (W + 200) - 100,
      y: depth.y,
      h: range(...depth.h),
      fog: depth.fog,
      blur: depth.blur,
      par: depth.par,
      bright: depth.bright,
      flip: rnd() < 0.5,
      sway: 0,
    });
};
// Far to near: smaller, foggier, blurrier, slower with the camera. Few trunks per layer, so the haze
// between them stays open and the layers read as depth instead of a wall.
layer(6, { y: GROUND - 60, h: [430, 500], fog: 0.8, blur: 3.5, par: 0.15, bright: 0.9 });
layer(4, { y: GROUND - 30, h: [520, 640], fog: 0.55, blur: 2.2, par: 0.35, bright: 0.85 });
layer(2, { y: GROUND - 6, h: [760, 860], fog: 0.28, blur: 1.0, par: 0.6, bright: 0.8 });
// On the ground line, in focus.
const on = (x: number, sink: number) => groundAt(x) + sink;
// Broken snags stand between the backdrop and the ground line.
for (const [i, x] of [80, 560, 1150].entries())
  props.push({
    t: snags,
    cell: snagCells[(i * 3 + 1) % 4],
    x,
    y: on(x, -4),
    h: range(300, 380),
    fog: 0.18,
    blur: 0.6,
    par: 0.85,
    bright: 0.85,
    flip: i === 1,
    sway: 0,
  });
const near: Prop[] = [
  { t: stump, x: 960, y: on(960, 18), h: 230, fog: 0.05, blur: 0, par: 1, bright: 0.95, flip: false, sway: 0 },
  { t: roots, x: 300, y: on(300, 16), h: 150, fog: 0.08, blur: 0, par: 1, bright: 0.9, flip: false, sway: 0 },
  { t: log, x: 660, y: on(660, 22), h: 95, fog: 0.08, blur: 0, par: 1, bright: 0.9, flip: true, sway: 0 },
  { t: rock, x: 1190, y: on(1190, 14), h: 70, fog: 0.06, blur: 0, par: 1, bright: 0.9, flip: false, sway: 0 },
  { t: glowM, x: 870, y: on(870, 10), h: 60, fog: 0, blur: 0, par: 1, bright: 1, flip: false, sway: 1.2 },
  { t: paleM, x: 455, y: on(455, 10), h: 70, fog: 0, blur: 0, par: 1, bright: 1, flip: false, sway: 1.5 },
];
// Static mushrooms from the variety sheet, a few clusters.
for (let i = 0; i < 12; i++) {
  const cx = [200, 560, 760, 1100][i % 4]! + range(-40, 40);
  near.push({
    t: variety[Math.floor(rnd() * variety.length)]!,
    x: cx,
    y: on(cx, 9),
    h: range(18, 40),
    fog: 0,
    blur: 0,
    par: 1,
    bright: 0.95,
    flip: rnd() < 0.5,
    sway: 0.8,
  });
}
// Out-of-focus framing in front (dark, blurred, moves most with the camera).
const front: Prop[] = [
  { t: snags, cell: snagCells[0], x: -20, y: H + 80, h: 900, fog: 0, blur: 3.8, par: 1.5, bright: 0.28, flip: false, sway: 0 },
  { t: roots, x: 1250, y: H + 50, h: 230, fog: 0, blur: 3.2, par: 1.45, bright: 0.3, flip: true, sway: 0 },
];

// ---- mycelium -------------------------------------------------------------------------------------------

type Mush = { x: number; h: number; born: number; feed: number; flip: boolean; node: number; kind: number; hue: number };
type Node = { x: number; y: number; p: number; kids: number[]; born: number; mush?: Mush };
type Tip = { n: number; ang: number; run: number };
const nodes: Node[] = [];
let tips: Tip[] = [];
const mushes: Mush[] = [];
const roots0: number[] = [];
let time = 0;

for (const x of [260, 690, 1040]) {
  roots0.push(nodes.length);
  nodes.push({ x, y: groundAt(x) + range(120, 170), p: -1, kids: [], born: 0 });
  for (let k = 0; k < 4; k++) tips.push({ n: nodes.length - 1, ang: (k / 4) * Math.PI * 2 + range(0, 1), run: 0 });
}

function growMycelium(dt: number): void {
  const STEP = 7;
  const next: Tip[] = [];
  for (const tip of tips) {
    tip.run += dt * 26;
    let alive = true;
    while (tip.run >= STEP && alive) {
      tip.run -= STEP;
      const from = nodes[tip.n]!;
      tip.ang += (rnd() - 0.5) * 0.7;
      // Stay in the soil: steer away from the surface and the bottom, prefer spreading sideways.
      if (from.y < groundAt(from.x) + 40) tip.ang += 0.25 * Math.sign(Math.cos(tip.ang) || 1);
      if (from.y > H - 30) tip.ang -= 0.25 * Math.sign(Math.cos(tip.ang) || 1);
      const x = from.x + Math.cos(tip.ang) * STEP,
        y = from.y + Math.sin(tip.ang) * STEP;
      if (x < -20 || x > W + 20 || y > H - 8 || nodes.length > 2600) {
        alive = false;
        break;
      }
      const id = nodes.length;
      nodes.push({ x, y, p: tip.n, kids: [], born: time });
      from.kids.push(id);
      tip.n = id;
      // Near the surface a tip may fruit: a mushroom pushes up out of the moss above it.
      if (y < groundAt(x) + 48 && rnd() < 0.08 && !mushes.some((m) => Math.abs(m.x - x) < 90) && mushes.length < 6) {
        // Few and varied: a row of identical toadstools reads as a pattern, not a forest.
        const m: Mush = {
          x,
          h: range(30, 95),
          born: time,
          feed: 0,
          flip: rnd() < 0.5,
          node: id,
          kind: rnd() < 0.5 ? 0 : 1,
          hue: range(0.85, 1.05),
        };
        nodes[id]!.mush = m;
        mushes.push(m);
        alive = false;
        break;
      }
      if (rnd() < 0.07 && tips.length + next.length < 60) next.push({ n: id, ang: tip.ang + (rnd() < 0.5 ? 0.8 : -0.8), run: 0 });
      if (rnd() < 0.006) alive = false;
    }
    if (alive) next.push(tip);
  }
  tips = next;
  // Never let it die out completely.
  if (tips.length < 6) {
    const n = Math.floor(rnd() * nodes.length);
    tips.push({ n, ang: range(0, Math.PI * 2), run: 0 });
  }
}

type Pulse = { from: number; to: number; k: number };
let pulses: Pulse[] = [];
let pulseClock = 0;
function flow(dt: number): void {
  pulseClock += dt;
  while (pulseClock > 0.12) {
    pulseClock -= 0.12;
    const r = roots0[Math.floor(rnd() * roots0.length)]!;
    const kids = nodes[r]!.kids;
    if (kids.length) pulses.push({ from: r, to: kids[Math.floor(rnd() * kids.length)]!, k: 0 });
  }
  const next: Pulse[] = [];
  for (const p of pulses) {
    const a = nodes[p.from]!,
      b = nodes[p.to]!;
    p.k += (dt * 90) / (Math.hypot(b.x - a.x, b.y - a.y) || 1);
    while (p.k >= 1) {
      p.k -= 1;
      const here = nodes[p.to]!;
      if (here.mush) here.mush.feed = 1;
      if (!here.kids.length) {
        p.k = -1;
        break;
      }
      // Nutrients go where the fruit is: prefer branches that lead to a mushroom.
      const fed = here.kids.filter((k) => leadsToMush(k));
      const pick = fed.length && rnd() < 0.8 ? fed : here.kids;
      p.from = p.to;
      p.to = pick[Math.floor(rnd() * pick.length)]!;
    }
    if (p.k >= 0) next.push(p);
  }
  pulses = next;
}
const leadsCache = new Map<number, boolean>();
function leadsToMush(n: number): boolean {
  const c = leadsCache.get(n);
  if (c !== undefined) return c;
  // Iterative walk down the subtree.
  const stack = [n];
  let found = false;
  while (stack.length && !found) {
    const k = stack.pop()!;
    if (nodes[k]!.mush) found = true;
    else stack.push(...nodes[k]!.kids);
  }
  leadsCache.set(n, found);
  return found;
}

// ---- critters ---------------------------------------------------------------------------------------------

type Bug = {
  body: Tex;
  x: number;
  dir: number;
  speed: number;
  v: number;
  len: number;
  legs: number;
  legLen: number;
  phase: number;
  clear: number;
  ant: number;
  pause: number;
};
const bugs: Bug[] = [
  { body: bodies[0]!, x: 420, dir: 1, speed: 22, v: 22, len: 58, legs: 3, legLen: 0.62, phase: 0, clear: 0.2, ant: 0.45, pause: 0 },
  { body: bodies[1]!, x: 820, dir: -1, speed: 12, v: 12, len: 40, legs: 7, legLen: 0.32, phase: 0, clear: 0.08, ant: 0.4, pause: 0 },
  { body: bodies[2]!, x: 150, dir: 1, speed: 46, v: 46, len: 30, legs: 3, legLen: 0.85, phase: 0, clear: 0.28, ant: 0.6, pause: 0 },
  { body: bodies[2]!, x: 1150, dir: -1, speed: 40, v: 40, len: 28, legs: 3, legLen: 0.85, phase: 0.3, clear: 0.28, ant: 0.6, pause: 0 },
  { body: bodies[3]!, x: 700, dir: 1, speed: 9, v: 9, len: 26, legs: 3, legLen: 0.42, phase: 0, clear: 0.1, ant: 0.25, pause: 0 },
];
const snail = { x: 520, phase: 0 };

function moveBugs(dt: number): void {
  for (const b of bugs) {
    // Now and then stop and look around.
    if (b.pause > 0) b.pause -= dt;
    else if (rnd() < dt * 0.08) b.pause = range(0.6, 2.2);
    const target = b.pause > 0 ? 0 : b.speed;
    b.v += (target - b.v) * Math.min(1, dt * 4);
    b.x += b.dir * b.v * dt;
    b.phase += (b.v / (b.len * 0.42)) * dt;
    if (b.x > W + 80) b.x = -80;
    if (b.x < -80) b.x = W + 80;
  }
  snail.phase += dt * 2.4;
  snail.x += dt * 7 * (0.55 + 0.45 * Math.sin(snail.phase));
  if (snail.x > W + 80) snail.x = -80;
}

const LEG = [0.07, 0.05, 0.035] as const;

/** Two-bone leg: hip to foot with the knee raised. */
function leg(hx: number, hy: number, fx: number, fy: number, a: number, b: number, w: number, shade: number): void {
  let dx = fx - hx,
    dy = fy - hy;
  let d = Math.hypot(dx, dy);
  if (d > a + b - 0.01) {
    const k = (a + b - 0.01) / d;
    dx *= k;
    dy *= k;
    d = a + b - 0.01;
  }
  const base = Math.atan2(dy, dx);
  const al = Math.acos(Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d))));
  const k1 = [hx + Math.cos(base - al) * a, hy + Math.sin(base - al) * a];
  const k2 = [hx + Math.cos(base + al) * a, hy + Math.sin(base + al) * a];
  const knee = k1[1]! < k2[1]! ? k1 : k2;
  const [r, g, bl] = LEG.map((c) => c * shade) as [number, number, number];
  gl.seg(hx, hy, knee[0]!, knee[1]!, w, r, g, bl, 0.95);
  gl.seg(knee[0]!, knee[1]!, hx + dx, hy + dy, w * 0.75, r, g, bl, 0.95);
}

function drawBug(b: Bug, cam: number): void {
  const h = (b.len * b.body.h) / b.body.w;
  const surface = (x: number) => groundAt(x - cam) + 6;
  const bob = Math.sin(b.phase * Math.PI * 4) * b.len * 0.006 * Math.min(1, b.v / b.speed);
  // The body follows the slope: a local frame (along the body, up from it) around its bottom centre.
  const rot = slopeAt(b.x);
  const ux = Math.cos(rot),
    uy = Math.sin(rot),
    nx = Math.sin(rot),
    ny = -Math.cos(rot);
  const cx0 = b.x + cam,
    cy0 = surface(cx0);
  const lift0 = b.len * b.clear - bob;
  const cx = cx0 + nx * lift0,
    bottom = cy0 + ny * lift0;
  const at = (along: number, up: number) => [cx + ux * along * b.dir + nx * up, bottom + uy * along * b.dir + ny * up] as const;
  const stride = b.len * 0.42;
  const legs = (side: number) => {
    for (let i = 0; i < b.legs; i++) {
      const f = b.legs === 1 ? 0.5 : i / (b.legs - 1);
      const along = (0.28 + f * 0.44 - 0.5) * b.len; // from back (−) to front (+)
      const [hx, hy] = at(along, h * 0.22);
      // Tripod gait for six legs, a travelling wave for many.
      const off = b.legs === 3 ? ((i + side) % 2) * 0.5 : i * 0.13 + side * 0.5;
      const p = (((b.phase + off) % 1) + 1) % 1;
      const duty = 0.62;
      let rel: number, lift: number;
      if (p < duty) {
        rel = stride / 2 - (p / duty) * stride;
        lift = 0;
      } else {
        const q = (p - duty) / (1 - duty);
        rel = -stride / 2 + q * stride;
        lift = Math.sin(Math.PI * q) * b.len * 0.07;
      }
      const moving = Math.min(1, b.v / b.speed);
      const spread = (f - 0.5) * b.len * 0.75 + (side ? -2 : 2);
      const fx = hx + b.dir * (spread + rel * moving);
      const fy = surface(fx) - lift * moving;
      const L = b.len * b.legLen;
      leg(hx, hy, fx, fy, L * 0.5, L * 0.6, Math.max(1, b.len * 0.035), side ? 0.6 : 1);
    }
  };
  legs(1);
  gl.draw(b.body, { x: cx, y: bottom, h, flip: b.dir > 0, bright: 0.95, rot });
  legs(0);
  // Antennae: two segments that twitch.
  const [hx, hy] = at(b.len * 0.46, h * 0.6);
  for (const s of [0, 1]) {
    const tw = Math.sin(time * 5 + s * 2 + b.x * 0.1) * 0.15;
    const A = b.len * b.ant;
    const a1 = -0.5 - s * 0.15 + tw,
      a2 = 0.35 + tw * 1.5;
    const mx = hx + b.dir * Math.cos(a1) * A * 0.55,
      my = hy + Math.sin(a1) * A * 0.55;
    const ex = mx + b.dir * Math.cos(a1 + a2) * A * 0.5,
      ey = my + Math.sin(a1 + a2) * A * 0.5;
    const shade = s ? 0.6 : 1;
    gl.seg(hx, hy, mx, my, Math.max(0.8, b.len * 0.02), LEG[0] * shade, LEG[1] * shade, LEG[2] * shade, 0.9);
    gl.seg(mx, my, ex, ey, Math.max(0.7, b.len * 0.016), LEG[0] * shade, LEG[1] * shade, LEG[2] * shade, 0.9);
  }
}

// ---- motes ------------------------------------------------------------------------------------------------

const motes = Array.from({ length: 80 }, () => ({
  x: range(0, W),
  y: range(0, GROUND + 40),
  r: range(0.8, 2.4),
  ph: range(0, 6.28),
  v: range(3, 10),
}));

// ---- frame -------------------------------------------------------------------------------------------------

// Debug: ?hide=far,mid,back,near,front leaves layers out.
const hide = new Set((new URLSearchParams(location.search).get('hide') ?? '').split(','));
// ---- atmospheres -------------------------------------------------------------------------------------------
// The program will change the air's colour; the assets must hold up under all of these. Keys 1–4, or ?theme=.

type Rgb = [number, number, number];
const THEMES: Record<string, Theme> = {
  amber: {
    skyLight: [0.95, 0.75, 0.46],
    skyDeep: [0.4, 0.31, 0.19],
    fog: [0.8, 0.62, 0.38],
    tint: [1, 0.93, 0.82],
    rays: [1, 0.82, 0.55],
    soilTop: [0.15, 0.1, 0.065],
    soilBottom: [0.04, 0.03, 0.02],
    thread: [0.93, 0.88, 0.74],
    glow: [1, 0.75, 0.45],
  },
  moss: {
    skyLight: [0.72, 0.86, 0.5],
    skyDeep: [0.16, 0.27, 0.15],
    fog: [0.46, 0.6, 0.36],
    tint: [0.88, 1, 0.82],
    rays: [0.8, 1, 0.6],
    soilTop: [0.09, 0.1, 0.06],
    soilBottom: [0.02, 0.03, 0.02],
    thread: [0.85, 0.95, 0.75],
    glow: [0.6, 1, 0.5],
  },
  dusk: {
    skyLight: [0.86, 0.55, 0.8],
    skyDeep: [0.22, 0.13, 0.3],
    fog: [0.56, 0.4, 0.62],
    tint: [0.95, 0.82, 1],
    rays: [1, 0.7, 0.95],
    soilTop: [0.11, 0.07, 0.1],
    soilBottom: [0.03, 0.02, 0.04],
    thread: [0.95, 0.85, 1],
    glow: [0.95, 0.5, 1],
  },
  night: {
    skyLight: [0.42, 0.62, 0.9],
    skyDeep: [0.05, 0.08, 0.18],
    fog: [0.22, 0.32, 0.5],
    tint: [0.62, 0.74, 1],
    rays: [0.5, 0.75, 1],
    soilTop: [0.05, 0.06, 0.09],
    soilBottom: [0.01, 0.015, 0.03],
    thread: [0.75, 0.9, 1],
    glow: [0.35, 0.85, 1],
  },
};
const ORDER = Object.keys(THEMES);
let themeTarget: Theme = THEMES[params.get('theme') ?? 'amber'] ?? THEMES.amber!;
gl.theme = structuredClone(themeTarget);
addEventListener('keydown', (e: KeyboardEvent) => {
  const i = Number(e.key) - 1;
  if (ORDER[i]) themeTarget = THEMES[ORDER[i]!]!;
});
/** Eases the live theme toward the chosen one, so a change of air takes a couple of seconds. */
function blendTheme(dt: number): void {
  const k = Math.min(1, dt * 1.5);
  for (const key of Object.keys(themeTarget) as (keyof Theme)[]) {
    const a = gl.theme[key],
      b = themeTarget[key] as Rgb;
    for (let c = 0; c < 3; c++) a[c] = a[c]! + (b[c]! - a[c]!) * k;
  }
}

let mouse = 0;
addEventListener('pointermove', (e: PointerEvent) => (mouse = (e.clientX / innerWidth - 0.5) * 2));

function update(dt: number): void {
  blendTheme(dt);
  time += dt;
  gl.time = time;
  growMycelium(dt);
  leadsCache.clear();
  flow(dt);
  moveBugs(dt);
  for (const m of mushes) m.feed = Math.max(0, m.feed - dt * 1.8);
  for (const m of motes) {
    m.x += Math.sin(time * 0.2 + m.ph) * dt * 4 + dt * m.v * 0.3;
    m.y += Math.cos(time * 0.17 + m.ph) * dt * 3 - dt * 0.8;
    if (m.x > W) m.x = 0;
    if (m.y < 0) m.y = GROUND + 40;
  }
}

function render(): void {
  const cam = Math.sin(time * 0.07) * 26 + mouse * 30;
  gl.begin();
  gl.fill(0);
  const drawProp = (p: Prop) =>
    gl.draw(p.t, {
      x: p.x + cam * p.par,
      y: p.y,
      h: p.h,
      fog: p.fog,
      blur: p.blur,
      bright: p.bright,
      cell: p.cell,
      flip: p.flip,
      sway: p.sway,
      swayPhase: time * 1.3 + p.x * 0.02,
      // Atlas cells: soft sides; backdrop trunks also sink into the ground mist at their feet.
      edge: p.cell ? 0.12 : 0,
      fade: p.cell ? 0.12 : 0,
    });
  for (const [i, p] of props.entries()) if (i < 12 && !hide.has(i < 6 ? 'far' : i < 10 ? 'mid' : 'back')) drawProp(p);
  const curve = (f: (x: number) => number, par: number, lift: number) => {
    const pts: { x: number; y: number }[] = [];
    for (let sx = -40; sx <= W + 40; sx += 12) pts.push({ x: sx, y: f(sx - cam * par) - lift });
    return pts;
  };
  const tileW = 520,
    tileH = (tileW * ground.h) / ground.w;
  // A farther ridge of the same moss, in the haze (and the snags in front of it).
  if (!hide.has('ridge'))
    gl.ribbon(ground, curve(ridgeAt, 0.7, 14), tileH * 0.8, tileW * 0.7, { fog: 0.4, blur: 1.4, bright: 0.85, fade: 0.5 });
  gl.fill(4);
  for (const [i, p] of props.entries()) if (i >= 12 && !hide.has('snags')) drawProp(p);
  // Soil under the curve, then the moss-and-soil texture bent along it (mirrored repeat hides the seam).
  const T = gl.theme;
  // The soil texture at the strip's texel scale (step 14: 479 px of soil = 181 units next to a 1376 px strip at 520).
  if (soils) gl.soil(soils, curve(groundAt, 1, -tileH * 0.55), H, cam, { tile: 181, bright: 0.72 });
  else gl.below(curve(groundAt, 1, -tileH * 0.55), H, [...T.soilTop, 1], [...T.soilBottom, 1]);
  gl.ribbon(ground, curve(groundAt, 1, 22), tileH, tileW, { bright: 0.92, fade: 0.3 });

  // Mycelium: a soft additive glow, then the pale threads, then the pulses.
  for (const n of nodes) {
    if (n.p < 0) continue;
    const p = nodes[n.p]!;
    gl.seg(p.x + cam, p.y, n.x + cam, n.y, 6, ...T.glow, 0.045, true);
  }
  for (const n of nodes) {
    if (n.p < 0) continue;
    const p = nodes[n.p]!;
    const age = time - n.born;
    const w = 0.7 + Math.min(1.4, age * 0.04);
    gl.seg(p.x + cam, p.y, n.x + cam, n.y, w, ...T.thread, Math.min(0.6, age * 0.6));
  }
  for (const t of tips) {
    const n = nodes[t.n]!;
    gl.dot(n.x + cam, n.y, 3, ...T.glow, 0.35);
  }
  for (const m of mushes) {
    // A thread rises to each mushroom's foot.
    const n = nodes[m.node]!;
    gl.seg(n.x + cam, n.y, m.x + cam, groundAt(m.x) + 8, 1.2, ...T.thread, 0.5);
  }
  for (const p of pulses) {
    const a = nodes[p.from]!,
      b = nodes[p.to]!;
    const x = a.x + (b.x - a.x) * p.k + cam,
      y = a.y + (b.y - a.y) * p.k;
    gl.dot(x, y, 7, ...T.glow, 0.18);
    gl.dot(x, y, 2, 1, 0.95, 0.8, 0.9);
  }

  if (!hide.has('near')) for (const p of near) drawProp(p);
  // Mushrooms raised by the mycelium: the growth frames, then a little settle.
  for (const m of mushes) {
    const age = time - m.born;
    const frames = grow[m.kind]!;
    const f = Math.min(frames.length - 1, Math.floor(age / 0.32));
    const settle = age > 2.6 ? 1 + 0.06 * Math.sin((age - 2.6) * 9) * Math.exp(-(age - 2.6) * 2.5) : 1;
    gl.draw(frames[f]!, {
      bright: m.hue,
      x: m.x + cam,
      y: groundAt(m.x) + 10,
      h: m.h * settle,
      flip: m.flip,
      sway: 1.2,
      swayPhase: time * 1.5 + m.x,
      glow: m.feed * 0.5,
    });
    if (m.feed > 0) gl.dot(m.x + cam, groundAt(m.x) - m.h * 0.75, m.h * 0.45, ...T.glow, m.feed * 0.08);
  }
  gl.draw(snailT, {
    x: snail.x + cam,
    y: groundAt(snail.x) + 8,
    h: 50,
    rot: slopeAt(snail.x),
    crawl: [2.2, snail.phase * 2.5, 0.62],
    bright: 0.95,
  });
  for (const b of bugs) drawBug(b, cam);
  gl.flushLines();
  if (!hide.has('front')) for (const p of front) drawProp(p);
  gl.fill(2);
  for (const m of motes) {
    const tw = 0.5 + 0.5 * Math.sin(time * 2 + m.ph * 5);
    gl.dot(m.x + cam * 0.8, m.y, m.r, ...T.rays, 0.25 * tw);
  }
  gl.fill(3);
  gl.flushLines();
}

// Real time, unless a capture script drives the clock.
const manual = new URLSearchParams(location.search).has('capture');
declare global {
  interface Window {
    advance: (seconds: number, fps?: number) => void;
    ready: boolean;
  }
}
window.advance = (seconds, fps = 30) => {
  for (let t = 0; t < seconds; t += 1 / fps) update(1 / fps);
  render();
};
if (!manual) {
  let last = performance.now();
  const loop = (now: number) => {
    update(Math.min(0.05, (now - last) / 1000));
    last = now;
    render();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
window.ready = true;

// Debug handle for the browser console.
(window as unknown as { dbg: unknown }).dbg = { gl, props, trunks };
