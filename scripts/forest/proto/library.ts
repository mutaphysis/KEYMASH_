// The asset library viewer: everything the packer wrote (samples/pack/), loaded through the preloader with a
// progress bar, then shown group by group AT TRUE SCALE (each frame at w·s × h·s view units) on ground lines,
// next to the mature fly agaric and a 10 cm ruler, so sizes can be judged by eye (ASSETS.md, Review). A page that
// doesn't fit is zoomed out (the label says by how much). Mushroom lives play grow → hold → decay; soils are
// tiled 2 x 2 to show seams. Arrow keys or tap switch groups; keys 1–4 change the atmosphere, as in the prototype.

import { Gl, type Tex } from './gl';
import { fetchAssets, frameUV, uploadAssets, type Manifest } from './preload';

const W = 1280,
  H = 720;
const BASE = '/samples/pack/';

const bar = document.querySelector<HTMLDivElement>('#bar')!;
const label = document.querySelector<HTMLDivElement>('#label')!;
const canvas = document.querySelector('canvas')!;
const gl = new Gl(canvas);
gl.view = [W, H];

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

const manifest = (await (await fetch(BASE + 'manifest.json')).json()) as Manifest;
const t0 = performance.now();
const fetched = await fetchAssets(
  manifest,
  (file) => BASE + file,
  (loaded, total) => {
    bar.style.width = `${(100 * loaded) / total}%`;
    label.textContent = `gathering moss · ${Math.round((100 * loaded) / total)} % · ${(loaded / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} MB`;
  },
);
const fetchMs = performance.now() - t0;
const up = uploadAssets(gl.gl, fetched);
label.textContent = `${Object.keys(manifest.frames).length} frames, ${Object.keys(manifest.sequences).length} sequences, ${(manifest.bytes / 1e6).toFixed(1)} MB · fetched + decoded in ${(fetchMs / 1000).toFixed(1)} s, uploaded in ${(performance.now() - t0 - fetchMs).toFixed(0)} ms`;
document.querySelector<HTMLDivElement>('#loader')!.classList.add('done');

const frame = (name: string): Tex & { foot?: number; s: number } => {
  const f = frameUV(manifest, name);
  return { tex: up.textures.get(f.atlas)!.tex, w: f.w, h: f.h, uv: f.uv, foot: f.foot, s: f.s };
};
// The foot fade is a runtime choice: ?foot=ramp,side (fractions); ?foot=0 shows the strips as generated.
const footParam = (new URLSearchParams(location.search).get('foot') ?? '0.08,0.3').split(',').map(Number);

// Pages: one per atlas group, plus the soils.
const groups = [...new Set(Object.values(manifest.frames).map((f) => f.atlas.replace(/-\d+$/, '')))];
const pages = [...groups, 'soils'];
let page = 0;
addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'ArrowRight') page = (page + 1) % pages.length;
  if (e.key === 'ArrowLeft') page = (page + pages.length - 1) % pages.length;
});
canvas.addEventListener('pointerdown', () => (page = (page + 1) % pages.length));

/** What plays as one item: a single frame, a sequence, or a mushroom's life (grow, hold mature, decay, hold remnant). */
type Item = { frames: string[]; hold: Map<number, number> };
const inSeq = new Set(Object.values(manifest.sequences).flat());
function items(group: string): Item[] {
  const out: Item[] = [];
  const seqs = Object.keys(manifest.sequences).filter((k) => manifest.frames[manifest.sequences[k]![0]!]!.atlas.startsWith(group + '-'));
  for (const k of seqs) {
    if (k.endsWith('.decay') && manifest.sequences[k.replace(/decay$/, 'grow')]) continue;
    const grow = manifest.sequences[k]!;
    const decay = k.endsWith('.grow') ? manifest.sequences[k.replace(/grow$/, 'decay')] : undefined;
    if (decay) {
      const frames = [...grow, ...decay.slice(1)];
      out.push({
        frames,
        hold: new Map([
          [grow.length - 1, 8],
          [frames.length - 1, 4],
        ]),
      });
    } else out.push({ frames: [...grow], hold: new Map([[grow.length - 1, 4]]) });
  }
  for (const [name, f] of Object.entries(manifest.frames))
    if (f.atlas.startsWith(group + '-') && !inSeq.has(name)) out.push({ frames: [name], hold: new Map() });
  return out;
}
/** The frame an item shows at a time (4 frames a second, holds counted in frames). */
function at(item: Item, t: number): string {
  const steps = item.frames.flatMap((f, i) => Array<string>(1 + (item.hold.get(i) ?? 0)).fill(f));
  const n = steps.length;
  return steps[((Math.floor(t * 4) % n) + n) % n]!;
}
/** An item's size on screen: the largest of its frames (view units). */
function extent(item: Item): [number, number] {
  let w = 0,
    h = 0;
  for (const n of item.frames) {
    const f = manifest.frames[n]!;
    w = Math.max(w, f.w * f.s);
    h = Math.max(h, f.h * f.s);
  }
  return [w, h];
}

// The reference on every page: the mature fly agaric (the scale's anchor).
const ref = manifest.sequences['life-amanita.grow']?.at(-1);
const CM = manifest.unitsPerCm;

/** Rows along ground lines at a zoom; returns positions (bottom centre) and the height used. */
function layout(list: Item[], zoom: number, x0: number): { pos: [number, number][]; height: number } {
  const pos: [number, number][] = [];
  const GAP = 14;
  let x = x0,
    rowH = 0,
    y = 0;
  const rows: number[][] = [[]];
  list.forEach((it, i) => {
    const [w, h] = extent(it).map((v) => v * zoom) as [number, number];
    if (x + w > W - 16 && x > x0) {
      y += rowH + 22;
      x = x0;
      rowH = 0;
      rows.push([]);
    }
    pos.push([x + w / 2, 0]);
    rows.at(-1)!.push(i);
    rowH = Math.max(rowH, h);
    x += w + GAP;
    // remember each row's floor once it is known
    for (const j of rows.at(-1)!) pos[j]![1] = y + rowH;
  });
  return { pos, height: y + rowH };
}

let time = 0;
function render(): void {
  gl.time = time;
  gl.begin();
  gl.fill(0);
  const p = pages[page]!;
  if (p === 'soils') {
    const soils = Object.keys(manifest.textures).filter((k) => manifest.textures[k]!.wrap !== 'mirror');
    // the ground strips side by side, each repeated mirrored 1.5 times (a seam would show)
    const strips = Object.keys(manifest.textures).filter((k) => manifest.textures[k]!.wrap === 'mirror');
    strips.forEach((key, i) => {
      const t = up.textures.get(key)!;
      const w = (W - 40) / strips.length - 10;
      gl.draw({ tex: t.tex, w: t.w, h: t.h, uv: [0, 0, 1.5, 1] }, { x: 20 + (i + 0.5) * (w + 10), y: 260, w, h: (w / 1.5) * (t.h / t.w) });
    });
    soils.forEach((key, i) => {
      const t = up.textures.get(key)!;
      const size = 280;
      // uv 0..2: the texture repeats twice each way (mirrored), so a seam would show in the middle
      gl.draw({ tex: t.tex, w: t.w, h: t.h, uv: [0, 0, 2, 2] }, { x: 170 + i * 315, y: 640, h: size, w: size });
    });
    label.textContent = 'ground strips (mirrored 1.5x) and soils (tiled 2 x 2)';
  } else {
    const list = items(p);
    // True scale if it fits, else zoomed out until it does.
    const refW = ref ? manifest.frames[ref]!.w * manifest.frames[ref]!.s : 0;
    let zoom = 1;
    for (let k = 0; k < 40 && layout(list, zoom, 40 + refW * zoom + 24).height > H - 90; k++) zoom *= 0.9;
    const x0 = 40 + refW * zoom + 24;
    const { pos } = layout(list, zoom, x0);
    const top = 40;
    // ground lines under every row
    for (const y of new Set(pos.map(([, y]) => y))) gl.seg(16, top + y, W - 16, top + y, 1.2, 0.35, 0.31, 0.25, 0.8);
    list.forEach((it, i) => {
      const name = at(it, time + i * 0.37);
      const t = frame(name);
      const [x, y] = pos[i]!;
      const foot =
        t.foot !== undefined && footParam[0]! > 0 ? ([t.foot, footParam[0]!, footParam[1] ?? 0.3] as [number, number, number]) : undefined;
      gl.draw(t, { x, y: top + y, w: t.w * t.s * zoom, h: t.h * t.s * zoom, sway: p === 'plants' ? 2 : 0, swayPhase: time * 2 + i, foot });
    });
    // the reference fly agaric and a 10 cm ruler, on the first ground line
    const floor = top + (pos[0]?.[1] ?? 100);
    if (ref) {
      const t = frame(ref);
      gl.draw(t, { x: 40 + (refW * zoom) / 2, y: floor, w: t.w * t.s * zoom, h: t.h * t.s * zoom });
    }
    const ruler = 10 * CM * zoom;
    gl.seg(40, floor + 10, 40 + ruler, floor + 10, 2, 0.84, 0.67, 0.44, 1);
    for (let c = 0; c <= 10; c++)
      gl.seg(40 + (c * ruler) / 10, floor + 10, 40 + (c * ruler) / 10, floor + (c % 5 ? 13 : 16), 1, 0.84, 0.67, 0.44, 1);
    label.textContent = `${p} · ${list.length} items · ${zoom === 1 ? 'true scale' : `zoomed out ×${zoom.toFixed(2)}`} · ruler 10 cm, fly agaric 20 cm`;
  }
  gl.flushLines();
}

let last = performance.now();
const loop = (now: number) => {
  // rAF's timestamp can be earlier than the performance.now() read before the first frame
  time += Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  render();
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);

declare global {
  interface Window {
    showPage: (i: number) => string;
    pagesCount: number;
  }
}
window.showPage = (i) => {
  page = i % pages.length;
  render();
  return pages[page]!;
};
window.pagesCount = pages.length;
