// Soil tiling study: the same soil field drawn with several anti-repetition techniques side by side, at the scale
// the ground strip gives the soil (520 view units per 1376 texels: a 479 px tile is 181 units, about 7 repeats
// across the view). Captured by `bun scripts/forest/proto.ts --tiling` into samples/14-tiling/.
//
//   repeat     plain GL repeat (what the library does now)
//   iq1        per square tile a random offset (and mirror), blended near the borders (Quilez, "texture repetition",
//              technique 1): 4 taps
//   iq2        smooth Voronoi: random offsets per feature point, Gaussian weights (Quilez technique 2): 9 taps
//   iq3        two offset copies picked by a low-frequency noise (Quilez technique 3): 2 taps
//   hexlin     hex tiling: a random offset (and mirror) per vertex of a triangle grid, blended linearly: 3 taps
//   hex        the same with Mikkelsen's luminance-weighted sharpening ("Practical Real-Time Hex-Tiling", JCGT 2022)
//   hp         histogram-preserving blending (Heitz & Neyret 2018): blend in a Gaussianised copy, keep the variance,
//              map back through an inverse-CDF LUT: 3 taps + 3 LUT reads
//   horizons   hex, with the four soil variants picked per vertex by depth + noise, and a low-frequency tone (macro)
//
// URL: ?modes=repeat,hex&cols=2&world=1280x720&px=640&soil=0&patch=1[,2,…]&seed=1

const q = new URLSearchParams(location.search);
const MODES = ['repeat', 'iq1', 'iq2', 'iq3', 'hexlin', 'hex', 'hp', 'horizons'] as const;
type Mode = (typeof MODES)[number];
const modes = (q.get('modes') ?? MODES.join(',')).split(',') as Mode[];
const cols = Number(q.get('cols') ?? 2);
const [WW, WH] = (q.get('world') ?? '1280x720').split('x').map(Number) as [number, number];
const PX = Number(q.get('px') ?? 640);
const PY = Math.round((PX * WH) / WW);
const TILE = Number(q.get('tile') ?? (479 * 520) / 1376);
const soil = Number(q.get('soil') ?? 0);
// one patch size, or one per panel (?patch=1,2,3)
const patches = (q.get('patch') ?? '1').split(',').map(Number);
const seed = Number(q.get('seed') ?? 1);
const LABEL: Record<Mode, string> = {
  repeat: 'repeat · 1 tap',
  iq1: 'Quilez 1: offset + mirror per tile · 4 taps',
  iq2: 'Quilez 2: smooth Voronoi · 9 taps',
  iq3: 'Quilez 3: noise picks 1 of 8 offsets · 2 taps',
  hexlin: 'hex tiling, linear blend · 3 taps',
  hex: 'hex tiling, luminance-weighted (Mikkelsen) · 3 taps',
  hp: 'hex, histogram-preserving (Heitz–Neyret) · 3 taps + LUT',
  horizons: 'hex + 4 variants by depth + macro tone · 3 taps',
};

const rows = Math.ceil(modes.length / cols);
const canvas = document.querySelector('canvas')!;
canvas.width = cols * PX;
canvas.height = rows * PY;
const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true })!;

// --- textures --------------------------------------------------------------------------------------------------

const bitmaps = await Promise.all(
  [0, 1, 2, 3].map(async (i) =>
    createImageBitmap(await (await fetch(`/samples/pack/tex-soil-${i}.webp`)).blob(), {
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'none',
    }),
  ),
);
const S = bitmaps[0]!.width;
const levels = Math.floor(Math.log2(S)) + 1;

const soils = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D_ARRAY, soils);
gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, gl.RGBA8, S, S, 4);
bitmaps.forEach((b, i) => gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, S, S, 1, gl.RGBA, gl.UNSIGNED_BYTE, b));
gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

// Histogram-preserving blending needs the texture with each channel's histogram made Gaussian (T) and the way
// back (an inverse CDF as a LUT). Done here per channel; Heitz & Neyret decorrelate the channels first (PCA),
// which soil, brown in every channel, barely needs.
const SIGMA = 1 / 6;
const LUT = 512;
function erf(x: number): number {
  // Abramowitz & Stegun 7.1.26
  const s = Math.sign(x);
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
const cdfN = (x: number) => 0.5 * (1 + erf(x / Math.SQRT2));
function invN(p: number): number {
  // Acklam's rational approximation of the inverse normal CDF
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549671010115819, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const tail = (q: number) =>
    (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  if (p < 0.02425) return tail(Math.sqrt(-2 * Math.log(p)));
  if (p > 1 - 0.02425) return -tail(Math.sqrt(-2 * Math.log(1 - p)));
  const r = (p - 0.5) * (p - 0.5);
  return (
    ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * (p - 0.5)) /
    (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
  );
}
function gaussianise(b: ImageBitmap): { t: Uint8Array; lut: Uint8Array } {
  const c = new OffscreenCanvas(b.width, b.height).getContext('2d')!;
  c.drawImage(b, 0, 0);
  const px = c.getImageData(0, 0, b.width, b.height).data;
  const n = b.width * b.height;
  const t = new Uint8Array(n * 4);
  const lut = new Uint8Array(LUT * 4);
  let r = 12345;
  const rand = () => (r = (r * 1103515245 + 12345) >>> 0) / 4294967296;
  for (let ch = 0; ch < 3; ch++) {
    const hist = new Float64Array(256);
    for (let i = 0; i < n; i++) hist[px[i * 4 + ch]!]!++;
    const lo = new Float64Array(257);
    for (let v = 0; v < 256; v++) lo[v + 1] = lo[v]! + hist[v]!;
    // ties broken at random, so equal values spread over their whole rank range
    for (let i = 0; i < n; i++) {
      const v = px[i * 4 + ch]!;
      const u = Math.min(1 - 0.5 / n, Math.max(0.5 / n, (lo[v]! + rand() * hist[v]!) / n));
      t[i * 4 + ch] = Math.round(255 * Math.min(1, Math.max(0, 0.5 + invN(u) * SIGMA)));
    }
    for (let i = 0, v = 0; i < LUT; i++) {
      const u = cdfN(((i + 0.5) / LUT - 0.5) / SIGMA) * n;
      while (v < 255 && lo[v + 1]! < u) v++;
      lut[i * 4 + ch] = v;
    }
  }
  for (let i = 0; i < n; i++) t[i * 4 + 3] = 255;
  return { t, lut };
}
const g = gaussianise(bitmaps[soil]!);
const tex2d = (w: number, h: number, data: Uint8Array, mips: boolean, wrap: number) => {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  if (mips) gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  return tex;
};
const gauss = tex2d(S, S, g.t, true, gl.REPEAT);
const lut = tex2d(LUT, 1, g.lut, false, gl.CLAMP_TO_EDGE);

// --- shader ----------------------------------------------------------------------------------------------------

const VS = `#version 300 es
out vec2 vP;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  // p covers 0..2; the visible 0..1 is the panel, y down like the world
  vP = vec2(p.x, 1.0 - p.y);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
precision highp sampler2DArray;
in vec2 vP;
out vec4 o;
uniform sampler2DArray uSoil;
uniform sampler2D uGauss, uLut;
uniform int uMode;
uniform float uLayer, uTile, uPatch, uExp, uContrast, uMacro, uSeed;
uniform vec2 uWorld;

vec2 hash2(vec2 p) {
  p += uSeed * 17.31;
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i).x, hash2(i + vec2(1, 0)).x, f.x), mix(hash2(i + vec2(0, 1)).x, hash2(i + vec2(1, 1)).x, f.x), f.y);
}
float fbm(vec2 p) { return 0.55 * vnoise(p) + 0.3 * vnoise(p * 2.03 + 7.1) + 0.15 * vnoise(p * 4.1 + 3.3); }

// Triangle grid of equilateral triangles (edge 1 in st): the three vertices around st and their weights.
void triGrid(vec2 st, out vec3 w, out vec2 v1, out vec2 v2, out vec2 v3) {
  vec2 sk = vec2(st.x - 0.57735027 * st.y, 1.15470054 * st.y);
  vec2 b = floor(sk), f = fract(sk);
  float z = 1.0 - f.x - f.y;
  if (z > 0.0) { w = vec3(z, f.y, f.x); v1 = b; v2 = b + vec2(0, 1); v3 = b + vec2(1, 0); }
  else { w = vec3(-z, 1.0 - f.y, 1.0 - f.x); v1 = b + vec2(1, 1); v2 = b + vec2(1, 0); v3 = b + vec2(0, 1); }
}
// A vertex's place back in texture repeats (for per-vertex choices that depend on where it is).
vec2 vertexUV(vec2 v) { return vec2(v.x + 0.5 * v.y, 0.8660254 * v.y) * uPatch / 3.4641016; }

// Each vertex shows the texture at its own random offset, mirrored left-right half the time. No rotation: the
// soil is lit from above, a turned patch would be lit from the side.
vec2 vertexUVof(vec2 uv, vec2 v) {
  vec2 h = hash2(v);
  vec2 u = uv + h;
  if (fract(h.x * 13.7) > 0.5) u.x = -u.x;
  return u;
}

float layerAt(vec2 v) {
  if (uMode != 7) return uLayer;
  // horizons: leafy humus at the top, dark humus, plain, stony deeper down; the borders wander with noise
  vec2 wp = vertexUV(v) * uTile;
  float d = wp.y / uWorld.y + (fbm(wp / 260.0) - 0.5) * 0.55 + (hash2(v + 91.0).x - 0.5) * 0.12;
  return d < 0.18 ? 3.0 : d < 0.45 ? 2.0 : d < 0.75 ? 0.0 : 1.0;
}

vec3 hexTile(vec2 uv, vec2 dx, vec2 dy, float ex, float contrast) {
  vec3 w; vec2 v1, v2, v3;
  triGrid(uv * 3.4641016 / uPatch, w, v1, v2, v3);
  vec3 c1 = textureGrad(uSoil, vec3(vertexUVof(uv, v1), layerAt(v1)), dx, dy).rgb;
  vec3 c2 = textureGrad(uSoil, vec3(vertexUVof(uv, v2), layerAt(v2)), dx, dy).rgb;
  vec3 c3 = textureGrad(uSoil, vec3(vertexUVof(uv, v3), layerAt(v3)), dx, dy).rgb;
  // Mikkelsen: sharpen the barycentric weights, and let the brighter texel win where patches meet, so a
  // pebble stays a whole pebble instead of a faded ghost of one.
  const vec3 L = vec3(0.299, 0.587, 0.114);
  vec3 D = mix(vec3(1.0), vec3(dot(c1, L), dot(c2, L), dot(c3, L)), contrast);
  vec3 W = D * pow(w, vec3(ex));
  W /= W.x + W.y + W.z;
  return W.x * c1 + W.y * c2 + W.z * c3;
}

vec3 hpTile(vec2 uv, vec2 dx, vec2 dy) {
  vec3 w; vec2 v1, v2, v3;
  triGrid(uv * 3.4641016 / uPatch, w, v1, v2, v3);
  vec3 g1 = textureGrad(uGauss, vertexUVof(uv, v1), dx, dy).rgb;
  vec3 g2 = textureGrad(uGauss, vertexUVof(uv, v2), dx, dy).rgb;
  vec3 g3 = textureGrad(uGauss, vertexUVof(uv, v3), dx, dy).rgb;
  // Blending Gaussians lowers the variance by |w|; dividing by it brings the original contrast back.
  vec3 G = (w.x * g1 + w.y * g2 + w.z * g3 - 0.5) / length(w) + 0.5;
  return vec3(texture(uLut, vec2(G.r, 0.5)).r, texture(uLut, vec2(G.g, 0.5)).g, texture(uLut, vec2(G.b, 0.5)).b);
}

vec3 iq1Tile(vec2 uv, vec2 dx, vec2 dy) {
  vec2 i = floor(uv), f = fract(uv);
  // mirrored in x only: a flip in y would light the soil from below
  vec2 ha = hash2(i), hb = hash2(i + vec2(1, 0)), hc = hash2(i + vec2(0, 1)), hd = hash2(i + vec2(1, 1));
  vec2 ma = vec2(sign(fract(ha.x * 13.7) - 0.5), 1.0), mb = vec2(sign(fract(hb.x * 13.7) - 0.5), 1.0);
  vec2 mc = vec2(sign(fract(hc.x * 13.7) - 0.5), 1.0), md = vec2(sign(fract(hd.x * 13.7) - 0.5), 1.0);
  vec2 b = smoothstep(0.25, 0.75, f);
  return mix(
    mix(textureGrad(uSoil, vec3(uv * ma + ha, uLayer), dx, dy).rgb, textureGrad(uSoil, vec3(uv * mb + hb, uLayer), dx, dy).rgb, b.x),
    mix(textureGrad(uSoil, vec3(uv * mc + hc, uLayer), dx, dy).rgb, textureGrad(uSoil, vec3(uv * md + hd, uLayer), dx, dy).rgb, b.x),
    b.y);
}

vec3 iq2Tile(vec2 uv, vec2 dx, vec2 dy) {
  vec2 p = floor(uv), f = fract(uv);
  vec3 va = vec3(0.0);
  float wt = 0.0;
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash2(p + g), oz = hash2(p + g + 37.0);
      vec2 r = g - f + o;
      float w = exp(-5.0 * dot(r, r));
      va += w * textureGrad(uSoil, vec3(uv + oz, uLayer), dx, dy).rgb;
      wt += w;
    }
  return va / wt;
}

vec3 iq3Tile(vec2 uv, vec2 dx, vec2 dy) {
  float k = vnoise(uv * 0.7);
  float l = k * 8.0, f = fract(l), ia = floor(l);
  vec2 oa = sin(vec2(3.0, 7.0) * ia), ob = sin(vec2(3.0, 7.0) * (ia + 1.0));
  vec3 a = textureGrad(uSoil, vec3(uv + oa, uLayer), dx, dy).rgb;
  vec3 b = textureGrad(uSoil, vec3(uv + ob, uLayer), dx, dy).rgb;
  return mix(a, b, smoothstep(0.2, 0.8, f - 0.1 * dot(a - b, vec3(1.0))));
}

void main() {
  vec2 world = vP * uWorld;
  vec2 uv = world / uTile;
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  vec3 c;
  if (uMode == 0) c = texture(uSoil, vec3(uv, uLayer)).rgb;
  else if (uMode == 1) c = iq1Tile(uv, dx, dy);
  else if (uMode == 2) c = iq2Tile(uv, dx, dy);
  else if (uMode == 3) c = iq3Tile(uv, dx, dy);
  else if (uMode == 4) c = hexTile(uv, dx, dy, 1.0, 0.0);
  else if (uMode == 5) c = hexTile(uv, dx, dy, uExp, uContrast);
  else if (uMode == 6) c = hpTile(uv, dx, dy);
  else c = hexTile(uv, dx, dy, uExp, uContrast);
  if (uMacro > 0.0) {
    // a slow tone over several tiles: damp patches lighter and warmer, dry ones darker
    float m = fbm(world / 380.0 + 4.0) - 0.5;
    c *= 1.0 + uMacro * m * vec3(1.15, 1.0, 0.8);
  }
  o = vec4(c, 1.0);
}`;

function compile(type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
  return s;
}
const prog = gl.createProgram();
gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link');
gl.useProgram(prog);
const loc = (n: string) => gl.getUniformLocation(prog, n);

gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D_ARRAY, soils);
gl.activeTexture(gl.TEXTURE1);
gl.bindTexture(gl.TEXTURE_2D, gauss);
gl.activeTexture(gl.TEXTURE2);
gl.bindTexture(gl.TEXTURE_2D, lut);
gl.uniform1i(loc('uSoil'), 0);
gl.uniform1i(loc('uGauss'), 1);
gl.uniform1i(loc('uLut'), 2);
gl.uniform1f(loc('uLayer'), soil);
gl.uniform1f(loc('uTile'), TILE);
gl.uniform1f(loc('uExp'), Number(q.get('exp') ?? 7));
gl.uniform1f(loc('uContrast'), Number(q.get('contrast') ?? 0.6));
gl.uniform1f(loc('uSeed'), seed);
gl.uniform2f(loc('uWorld'), WW, WH);

const wrap = document.querySelector<HTMLDivElement>('#wrap')!;
modes.forEach((m, i) => {
  const x = (i % cols) * PX,
    y = Math.floor(i / cols) * PY;
  gl.viewport(x, canvas.height - y - PY, PX, PY);
  const patch = patches[i % patches.length]!;
  gl.uniform1f(loc('uPatch'), patch);
  gl.uniform1i(loc('uMode'), MODES.indexOf(m));
  gl.uniform1f(loc('uMacro'), m === 'horizons' ? Number(q.get('macro') ?? 0.5) : 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  const tag = document.createElement('div');
  tag.className = 'tag';
  tag.style.left = `${x + 8}px`;
  tag.style.top = `${y + 8}px`;
  tag.textContent = LABEL[m] + (patches.length > 1 ? ` · patch ×${patch}` : '');
  wrap.append(tag);
});

declare global {
  interface Window {
    ready: boolean;
  }
}
window.ready = true;

export {};
