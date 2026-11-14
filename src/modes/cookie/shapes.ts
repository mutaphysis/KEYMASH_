// Cookie cutters as 2D distance functions, and the Field: one cookie's footprint as a small
// distance texture that bites are carved into. Pure, DOM-free; the renderer uploads Field.data.
import { mulberry32 } from '../../lang/rng';
import type { Shape } from './recipe';

export const FIELD_N = 128; // texels per side of one cookie's tile
export const FIELD_EXT = 1.4; // the tile covers local [-1.4, 1.4]²
const TEXEL = (2 * FIELD_EXT) / FIELD_N;

type Sdf = (x: number, y: number) => number;
type Pt = [number, number];

export interface Anchors {
  eyes: Pt[];
  eyeR: number;
  letters: Pt;
  letterH: number;
  mouth: Pt;
}

const circle =
  (cx: number, cy: number, r: number): Sdf =>
  (x, y) =>
    Math.hypot(x - cx, y - cy) - r;

/** an ellipse as a squashed circle: not exact, but never further than the true distance */
const ellipse =
  (cx: number, cy: number, rx: number, ry: number): Sdf =>
  (x, y) =>
    (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * Math.min(rx, ry);

/** exact signed distance to a closed polygon */
function poly(pts: Pt[]): Sdf {
  const n = pts.length;
  return (x, y) => {
    let d = Infinity;
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [ax, ay] = pts[i]!;
      const [bx, by] = pts[j]!;
      const ex = bx - ax;
      const ey = by - ay;
      const wx = x - ax;
      const wy = y - ay;
      const h = Math.max(0, Math.min(1, (wx * ex + wy * ey) / Math.max(1e-9, ex * ex + ey * ey)));
      const px = wx - ex * h;
      const py = wy - ey * h;
      d = Math.min(d, px * px + py * py);
      if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
    }
    return (inside ? -1 : 1) * Math.sqrt(d);
  };
}

function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
const union =
  (k: number, ...parts: Sdf[]): Sdf =>
  (x, y) => {
    let d = parts[0]!(x, y);
    for (let i = 1; i < parts.length; i++) d = smin(d, parts[i]!(x, y), k);
    return d;
  };
/** stretch along x and y (factors >= 1 keep the distance a safe lower bound) */
const stretch =
  (f: Sdf, sx: number, sy: number): Sdf =>
  (x, y) =>
    f(x / sx, y / sy);

function star(points: number, outer: number, inner: number): Sdf {
  const pts: Pt[] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / points;
    const r = i % 2 ? inner : outer;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return poly(pts);
}

/** a fir tree: tiers from the tip down, each a bit wider, then the trunk */
function tree(widths: number[], top: number, bottom: number): Sdf {
  const right: Pt[] = [[0, top]];
  const step = (top - bottom) / widths.length;
  widths.forEach((w, i) => {
    const y = top - step * (i + 1);
    right.push([w, y]);
    if (i < widths.length - 1) right.push([w * 0.5, y]);
  });
  right.push([0.16, bottom], [0.16, bottom - 0.3]);
  const left = right
    .slice(1)
    .reverse()
    .map(([x, y]): Pt => [-x, y]);
  return poly([...right, ...left]);
}

/**
 * Two round lobes on a square tip, the sides tangent to the lobes so the outline has no kink
 * (Inigo Quilez's exact heart, scaled and centred, the tip rounded a little more).
 */
function heart(): Sdf {
  const s = 1.55;
  const dy = 0.856; // half its height: the middle of the heart sits at the origin
  return (x, y) => {
    const px = Math.abs(x) / s;
    const py = (y + dy) / s;
    let d: number;
    if (px + py > 1) d = Math.hypot(px - 0.25, py - 0.75) - Math.SQRT2 / 4;
    else {
      const m = 0.5 * Math.max(px + py, 0);
      d = Math.sqrt(Math.min(px * px + (py - 1) ** 2, (px - m) ** 2 + (py - m) ** 2)) * Math.sign(px - py);
    }
    return d * s - 0.04;
  };
}

function teddy(armY: number): Sdf {
  return union(
    0.08,
    circle(0, 0.55, 0.42),
    circle(-0.36, 0.9, 0.16),
    circle(0.36, 0.9, 0.16),
    ellipse(0, -0.3, 0.55, 0.6),
    circle(-0.64, armY, 0.2),
    circle(0.64, armY, 0.2),
    circle(-0.36, -0.88, 0.21),
    circle(0.36, -0.88, 0.21),
  );
}

function bell(skirt: number, knob: boolean): Sdf {
  const body = union(
    0.1,
    circle(0, 0.2, 0.6),
    poly([
      [-0.58, 0.25],
      [0.58, 0.25],
      [0.68, -0.25],
      [skirt, -0.58],
      [-skirt, -0.58],
      [-0.68, -0.25],
    ]),
  );
  const parts = [body, circle(0, -0.72, 0.17)];
  if (knob) parts.push(circle(0, 0.9, 0.15));
  return union(0.06, ...parts);
}

function base(shape: Shape, variant: number): Sdf {
  const v = variant === 1 || variant === 2 ? variant : 0;
  switch (shape) {
    case 'star':
      return v === 0 ? star(5, 1.1, 0.52) : v === 1 ? star(6, 1.1, 0.6) : star(5, 1.08, 0.68);
    case 'heart':
      return v === 0 ? heart() : v === 1 ? stretch(heart(), 1.15, 1) : stretch(heart(), 1, 1.12);
    case 'tree':
      return v === 0
        ? tree([0.52, 0.74, 0.95], 1.02, -0.62)
        : v === 1
          ? tree([0.7, 0.95], 1.0, -0.62)
          : tree([0.45, 0.62, 0.8, 0.95], 1.05, -0.64);
    case 'bear':
      return v === 0 ? union(0.08, circle(0, -0.1, 0.78), circle(-0.6, 0.62, 0.3), circle(0.6, 0.62, 0.3)) : teddy(v === 1 ? -0.08 : 0.22);
    case 'bell':
      return v === 0 ? bell(0.95, false) : v === 1 ? bell(1.05, false) : bell(0.95, true);
    case 'round':
    default:
      if (v === 1) return (x, y) => Math.hypot(x, y) - (0.9 + 0.06 * Math.cos(12 * Math.atan2(y, x)));
      return v === 0 ? circle(0, 0, 0.95) : ellipse(0, 0, 1.05, 0.85);
  }
}

/** the cutter: negative inside. wobble 0..1 makes every cookie a little different. */
export function outline(shape: Shape, variant: number, wobble: number, seed: number): Sdf {
  const f = base(shape, variant);
  const rnd = mulberry32(seed);
  const p1 = rnd() * 6.2832;
  const p2 = rnd() * 6.2832;
  const w = Math.max(0, Math.min(1, Number.isFinite(wobble) ? wobble : 0));
  return (x, y) => {
    const th = Math.atan2(y, x);
    return f(x, y) - 0.05 + 0.025 * w * Math.sin(3 * th + p1) + 0.015 * w * Math.sin(5 * th + p2);
  };
}

/** where eyes, letters and the mouth go; with a face the letters move down and shrink */
export function anchors(shape: Shape, variant: number, face = false): Anchors {
  switch (shape) {
    case 'tree':
      return {
        eyes: [
          [-0.17, 0.0],
          [0.17, 0.0],
        ],
        eyeR: 0.085,
        letters: [0, face ? -0.44 : -0.38],
        letterH: face ? 0.26 : 0.38,
        mouth: [0, -0.2],
      };
    case 'bear':
      if (variant === 0)
        return {
          eyes: [
            [-0.27, 0.05],
            [0.27, 0.05],
          ],
          eyeR: 0.11,
          letters: [0, face ? -0.56 : -0.45],
          letterH: face ? 0.24 : 0.36,
          mouth: [0, -0.3],
        };
      return {
        eyes: [
          [-0.15, 0.6],
          [0.15, 0.6],
        ],
        eyeR: 0.07,
        letters: [0, -0.3],
        letterH: 0.4,
        mouth: [0, 0.42],
      };
    case 'bell':
      return {
        eyes: [
          [-0.22, 0.25],
          [0.22, 0.25],
        ],
        eyeR: 0.1,
        letters: [0, face ? -0.36 : -0.2],
        letterH: face ? 0.26 : 0.42,
        mouth: [0, -0.02],
      };
    case 'star':
      return {
        eyes: [
          [-0.2, 0.14],
          [0.2, 0.14],
        ],
        eyeR: 0.09,
        letters: [0, face ? -0.3 : -0.02],
        letterH: face ? 0.22 : 0.4,
        mouth: [0, -0.08],
      };
    default:
      return {
        eyes: [
          [-0.26, 0.3],
          [0.26, 0.3],
        ],
        eyeR: 0.11,
        letters: [0, face ? -0.42 : -0.05],
        letterH: face ? 0.28 : 0.6,
        mouth: [0, 0.02],
      };
  }
}

/** 3-4 chamfer distance of every texel to the nearest texel where zero[i] is set, in thirds of a texel */
function chamfer(zero: (i: number) => boolean, n: number): Float32Array {
  const BIG = n * 8;
  const d = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) d[i] = zero(i) ? 0 : BIG;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= n || y >= n ? BIG : d[y * n + x]!);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      d[i] = Math.min(d[i]!, at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4);
    }
  for (let y = n - 1; y >= 0; y--)
    for (let x = n - 1; x >= 0; x--) {
      const i = y * n + x;
      d[i] = Math.min(d[i]!, at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4);
    }
  return d;
}

/** signed distance to the mask's edge, in texels, negative inside */
export function distanceTransform(inside: Uint8Array, n: number): Float32Array {
  const out = chamfer((i) => inside[i]! > 0, n);
  const inn = chamfer((i) => !inside[i], n);
  const res = new Float32Array(n * n);
  // the edge runs between texels: half a texel off either way
  for (let i = 0; i < n * n; i++) res[i] = inside[i] ? -(inn[i]! / 3 - 0.5) : out[i]! / 3 - 0.5;
  return res;
}

const N = FIELD_N;
const coord = (i: number) => -FIELD_EXT + (i + 0.5) * TEXEL;

export class Field {
  /** RGBA float tile, row-major, y up: R outline distance, G bite distance (negative = eaten), B decoration distance (negative = piped), A 0 */
  readonly data = new Float32Array(N * N * 4);
  /** bumped on every change; the renderer re-uploads when it differs */
  version = 0;
  /** texels with R < 0 at creation */
  readonly area0: number;

  constructor(sdf: Sdf) {
    let area = 0;
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const k = (j * N + i) * 4;
        const r = sdf(coord(i), coord(j));
        this.data[k] = Number.isFinite(r) ? r : 10;
        this.data[k + 1] = 10;
        this.data[k + 2] = 10;
        if (r < 0) area++;
      }
    this.area0 = area;
  }

  /** bilinear, clamped to the tile */
  sample(x: number, y: number): { r: number; g: number; b: number } {
    const u = Math.max(0, Math.min(N - 1, (x + FIELD_EXT) / TEXEL - 0.5));
    const v = Math.max(0, Math.min(N - 1, (y + FIELD_EXT) / TEXEL - 0.5));
    const i = Math.min(N - 2, Math.floor(u));
    const j = Math.min(N - 2, Math.floor(v));
    const fx = u - i;
    const fy = v - j;
    const k = (j * N + i) * 4;
    const d = this.data;
    const ch = (o: number) =>
      (d[k + o]! * (1 - fx) + d[k + 4 + o]! * fx) * (1 - fy) + (d[k + N * 4 + o]! * (1 - fx) + d[k + N * 4 + 4 + o]! * fx) * fy;
    return { r: ch(0), g: ch(1), b: ch(2) };
  }

  /** footprint distance: max(R, -G) */
  d(x: number, y: number): number {
    if (!(Math.abs(x) < FIELD_EXT && Math.abs(y) < FIELD_EXT)) return 1;
    const s = this.sample(x, y);
    return Math.max(s.r, -s.g);
  }

  /** carve a scalloped circle; radius may grow on repeated calls (min with what is there) */
  bite(cx: number, cy: number, radius: number, phase: number): void {
    if (!(Number.isFinite(cx) && Number.isFinite(cy) && radius > 0)) return;
    const reach = radius + 0.1;
    const i0 = Math.max(0, Math.floor((cx - reach + FIELD_EXT) / TEXEL));
    const i1 = Math.min(N - 1, Math.ceil((cx + reach + FIELD_EXT) / TEXEL));
    const j0 = Math.max(0, Math.floor((cy - reach + FIELD_EXT) / TEXEL));
    const j1 = Math.min(N - 1, Math.ceil((cy + reach + FIELD_EXT) / TEXEL));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const x = coord(i) - cx;
        const y = coord(j) - cy;
        const dist = Math.hypot(x, y) - radius - 0.035 * Math.cos(7 * Math.atan2(y, x) + phase);
        const k = (j * N + i) * 4 + 1;
        if (dist < this.data[k]!) this.data[k] = dist;
      }
    this.version++;
  }

  /** FIELD_N² local-unit distances */
  setDeco(dist: Float32Array): void {
    for (let i = 0; i < N * N; i++) this.data[i * 4 + 2] = dist[i] ?? 10;
    this.version++;
  }

  /** share of the original footprint that is left, 0..1 */
  left(): number {
    let n = 0;
    const d = this.data;
    for (let k = 0; k < d.length; k += 4) if (d[k]! < 0 && d[k + 1]! > 0) n++;
    return n / Math.max(1, this.area0);
  }

  /** centre of what is left, or null */
  centroid(): [number, number] | null {
    let n = 0;
    let sx = 0;
    let sy = 0;
    const d = this.data;
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const k = (j * N + i) * 4;
        if (d[k]! < 0 && d[k + 1]! > 0) {
          n++;
          sx += coord(i);
          sy += coord(j);
        }
      }
    return n ? [sx / n, sy / n] : null;
  }
}
