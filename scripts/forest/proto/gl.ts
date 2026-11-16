// A small WebGL2 renderer for the forest prototype: warped sprite quads (fog, depth blur via mip bias,
// sway, a crawl wave), soft lines (mycelium, legs, motes) and full-screen fills (haze, soil, rays, vignette).
// All colour is premultiplied.

/** The atmosphere, set at runtime: the assets are neutral-lit, the mood comes from here. Colours are linear-ish 0..1. */
export type Theme = {
  /** Sky near the light, and away from it. */
  skyLight: [number, number, number];
  skyDeep: [number, number, number];
  /** What far things sink into. */
  fog: [number, number, number];
  /** Key light multiplied onto every sprite. */
  tint: [number, number, number];
  rays: [number, number, number];
  soilTop: [number, number, number];
  soilBottom: [number, number, number];
  /** Mycelium threads, their glow and the nutrient pulses. */
  thread: [number, number, number];
  glow: [number, number, number];
};

export type Tex = { tex: WebGLTexture; w: number; h: number; uv: [number, number, number, number] };

export type SpriteOpts = {
  /** Bottom centre of the sprite, in design pixels. */
  x: number;
  y: number;
  h: number;
  /** Width; default keeps the texture's aspect. */
  w?: number;
  fog?: number;
  /** Mip bias: depth-of-field blur for far and very near layers. */
  blur?: number;
  bright?: number;
  alpha?: number;
  flip?: boolean;
  /** Top moves sideways by this many pixels (wind), at phase `swayPhase`. */
  sway?: number;
  swayPhase?: number;
  /** Peristaltic wave along the bottom band (snail foot): amplitude in px, phase, band start (0 top … 1 bottom). */
  crawl?: [number, number, number];
  /** UV crop inside the texture's own crop (atlas cells). */
  cell?: [number, number, number, number];
  glow?: number;
  /** Fade the bottom this fraction of the height out (to sink into soil or mist). */
  fade?: number;
  /** Fade both sides this fraction of the width out (atlas cells cut through neighbours). */
  edge?: number;
  /** Rotation in radians around the bottom centre (to stand on a slope). */
  rot?: number;
  /**
   * Foot mask: from `start` (0 top … 1 bottom) down, over `ramp` of the height, the sprite's sides fade out,
   * leaving `side` of the width on each side to fade. Turns a cell-wide ground strip into a tuft at runtime
   * (growth frames: start = the frame's measured foot), or sinks any prop's base into the ground.
   */
  foot?: [start: number, ramp: number, side: number];
};

const SPRITE_VS = `#version 300 es
in vec2 a;
uniform vec4 uRect; uniform vec2 uView; uniform vec4 uSway; uniform vec3 uCrawl; uniform float uRot;
out vec2 vA;
void main() {
  vec2 p = a;
  float top = 1.0 - a.y;
  float dx = uSway.x * top * top * sin(uSway.y);
  float band = smoothstep(uCrawl.z, 1.0, a.y);
  dx += uCrawl.x * band * sin(a.x * 9.0 - uCrawl.y);
  float dy = -uCrawl.x * 0.25 * band * (0.5 + 0.5 * sin(a.x * 9.0 - uCrawl.y + 1.2));
  vec2 pos = uRect.xy + p * uRect.zw + vec2(dx, dy);
  vec2 anchor = uRect.xy + vec2(uRect.z * 0.5, uRect.w);
  float cr = cos(uRot), sr = sin(uRot);
  pos = anchor + mat2(cr, sr, -sr, cr) * (pos - anchor);
  vA = a;
  gl_Position = vec4(pos.x / uView.x * 2.0 - 1.0, 1.0 - pos.y / uView.y * 2.0, 0.0, 1.0);
}`;

const SPRITE_FS = `#version 300 es
precision highp float;
in vec2 vA;
uniform sampler2D uTex; uniform vec4 uUV; uniform float uFlip;
uniform float uFog; uniform vec3 uFogCol; uniform float uBlur; uniform float uBright; uniform float uAlpha; uniform float uGlow;
uniform float uFade; uniform float uEdge; uniform vec3 uTint; uniform vec3 uFoot;
out vec4 o;
void main() {
  float u = mix(vA.x, 1.0 - vA.x, uFlip);
  vec4 c = texture(uTex, vec2(mix(uUV.x, uUV.z, u), mix(uUV.y, uUV.w, vA.y)), uBlur);
  c.rgb *= uBright * (1.0 + uGlow) * uTint;
  // Haze: far things sink into the warm air; more so towards their feet, where the ground mist is.
  float f = clamp(uFog * (0.85 + 0.3 * vA.y), 0.0, 1.0);
  c.rgb = mix(c.rgb, uFogCol * c.a, f);
  float k = uAlpha;
  if (uFade > 0.0) k *= smoothstep(1.0, 1.0 - uFade, vA.y);
  if (uEdge > 0.0) k *= smoothstep(0.0, uEdge, vA.x) * smoothstep(1.0, 1.0 - uEdge, vA.x);
  if (uFoot.z > 0.0) {
    float below = smoothstep(uFoot.x, uFoot.x + uFoot.y, vA.y);
    float side = smoothstep(0.0, uFoot.z, min(vA.x, 1.0 - vA.x));
    k *= mix(1.0, side * side, below);
  }
  o = c * k;
}`;

// Ribbons: a texture bent along a curve (curved ground). u runs along the curve and repeats mirrored.
const MESH_VS = `#version 300 es
in vec2 aPos; in vec2 aUV;
uniform vec2 uView;
out vec2 vUV;
void main() {
  vUV = aUV;
  gl_Position = vec4(aPos.x / uView.x * 2.0 - 1.0, 1.0 - aPos.y / uView.y * 2.0, 0.0, 1.0);
}`;

const MESH_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex; uniform float uFog; uniform vec3 uFogCol; uniform float uBlur; uniform float uBright; uniform float uFade; uniform vec3 uTint;
out vec4 o;
void main() {
  vec4 c = texture(uTex, vUV, uBlur);
  c.rgb *= uBright * uTint;
  c.rgb = mix(c.rgb, uFogCol * c.a, uFog);
  if (uFade > 0.0) c *= smoothstep(1.0, 1.0 - uFade, vUV.y);
  o = c;
}`;

// Soil below the ground: hex tiling (step 14, README) over the four soil variants of the library. Each vertex of a
// triangle grid shows the texture at its own random offset, mirrored left-right half the time (never turned: the
// soil is lit from above); the three are blended with Mikkelsen's luminance weights, so where patches meet the
// brighter texel wins and a pebble stays whole. The variant per vertex follows the depth below the surface:
// leafy humus, dark humus, plain, stony, with borders that wander.
const SOIL_VS = `#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aW;
uniform vec2 uView;
out vec2 vW; out float vD;
void main() {
  // aW: x along the world (scrolls with the camera), depth below the surface
  vW = vec2(aW.x, aPos.y); vD = aW.y;
  gl_Position = vec4(aPos.x / uView.x * 2.0 - 1.0, 1.0 - aPos.y / uView.y * 2.0, 0.0, 1.0);
}`;

const SOIL_FS = `#version 300 es
precision highp float;
precision highp sampler2DArray;
in vec2 vW; in float vD;
uniform sampler2DArray uSoil;
uniform float uTile, uPatch, uMacro, uBright;
uniform vec4 uBands;
uniform vec3 uTint, uDeep;
uniform float uDeepAt;
out vec4 o;

vec2 hash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i).x, hash2(i + vec2(1, 0)).x, f.x), mix(hash2(i + vec2(0, 1)).x, hash2(i + vec2(1, 1)).x, f.x), f.y);
}
float fbm(vec2 p) { return 0.55 * vnoise(p) + 0.3 * vnoise(p * 2.03 + 7.1) + 0.15 * vnoise(p * 4.1 + 3.3); }

// Equilateral triangles of edge 1 in st: the three vertices around st, and their barycentric weights.
void triGrid(vec2 st, out vec3 w, out vec2 v1, out vec2 v2, out vec2 v3) {
  vec2 sk = vec2(st.x - 0.57735027 * st.y, 1.15470054 * st.y);
  vec2 b = floor(sk), f = fract(sk);
  float z = 1.0 - f.x - f.y;
  if (z > 0.0) { w = vec3(z, f.y, f.x); v1 = b; v2 = b + vec2(0, 1); v3 = b + vec2(1, 0); }
  else { w = vec3(-z, 1.0 - f.y, 1.0 - f.x); v1 = b + vec2(1, 1); v2 = b + vec2(1, 0); v3 = b + vec2(0, 1); }
}
const float K = 3.4641016; // 2 sqrt 3: a patch is about half a tile across at uPatch 1

vec3 tap(vec2 uv, vec2 v, vec2 dx, vec2 dy) {
  // the vertex's place in the world, and its depth (the pixel's, moved by how far the vertex is)
  vec2 vw = vec2(v.x + 0.5 * v.y, 0.8660254 * v.y) * uPatch / K * uTile;
  float d = vD + vw.y - vW.y + (fbm(vw / 260.0) - 0.5) * 90.0 + (hash2(v + 91.0).x - 0.5) * 24.0;
  float layer = d < uBands.x ? 3.0 : d < uBands.y ? 2.0 : d < uBands.z ? 0.0 : 1.0;
  vec2 h = hash2(v);
  vec2 u = uv + h;
  if (fract(h.x * 13.7) > 0.5) u.x = -u.x;
  // derivatives of the plain uv: the offsets jump at patch borders, texture() would drop to the smallest mip there
  return textureGrad(uSoil, vec3(u, layer), dx, dy).rgb;
}

void main() {
  vec2 uv = vW / uTile;
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  vec3 w; vec2 v1, v2, v3;
  triGrid(uv * K / uPatch, w, v1, v2, v3);
  vec3 c1 = tap(uv, v1, dx, dy), c2 = tap(uv, v2, dx, dy), c3 = tap(uv, v3, dx, dy);
  const vec3 L = vec3(0.299, 0.587, 0.114);
  vec3 W = mix(vec3(1.0), vec3(dot(c1, L), dot(c2, L), dot(c3, L)), 0.6) * pow(w, vec3(7.0));
  vec3 c = (W.x * c1 + W.y * c2 + W.z * c3) / (W.x + W.y + W.z);
  // a slow tone over several tiles: damp patches lighter and warmer, dry ones darker
  c *= 1.0 + uMacro * (fbm(vW / 380.0 + 4.0) - 0.5) * vec3(1.15, 1.0, 0.8);
  c *= uBright * uTint;
  // deeper is darker, toward the theme's deep soil colour
  c = mix(c, uDeep, 0.75 * smoothstep(0.0, uDeepAt, vD));
  o = vec4(c, 1.0);
}`;

const LINE_VS = `#version 300 es
in vec2 aPos; in vec4 aCol; in vec2 aE;
uniform vec2 uView;
out vec4 vCol; out vec2 vE;
void main() {
  vCol = aCol; vE = aE;
  gl_Position = vec4(aPos.x / uView.x * 2.0 - 1.0, 1.0 - aPos.y / uView.y * 2.0, 0.0, 1.0);
}`;

const LINE_FS = `#version 300 es
precision highp float;
in vec4 vCol; in vec2 vE;
out vec4 o;
void main() {
  float k = max(0.0, 1.0 - dot(vE, vE));
  o = vec4(vCol.rgb * vCol.a, vCol.a) * k;
}`;

const FILL_VS = `#version 300 es
in vec2 a;
out vec2 vP;
void main() { vP = a; gl_Position = vec4(a.x * 2.0 - 1.0, 1.0 - a.y * 2.0, 0.0, 1.0); }`;

// mode 0 sky haze, 1 soil, 2 light rays (additive), 3 vignette, 4 ground mist band
const FILL_FS = `#version 300 es
precision highp float;
in vec2 vP;
uniform int uMode; uniform float uTime; uniform vec2 uView; uniform float uGround; uniform vec2 uLight;
uniform vec3 uSkyLight; uniform vec3 uSkyDeep; uniform vec3 uRays; uniform vec3 uFogCol;
out vec4 o;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec2 px = vP * uView;
  vec2 asp = vec2(uView.x / uView.y, 1.0);
  float d = length((vP - uLight) * asp);
  if (uMode == 0) {
    vec3 c = mix(uSkyLight, uSkyDeep, smoothstep(0.0, 1.3, d));
    c = mix(c, uFogCol * 0.7, 0.35 * smoothstep(0.3, 0.6, vP.y));
    o = vec4(c, 1.0);
  } else if (uMode == 1) {
    float g = (px.y - uGround) / (uView.y - uGround);
    float t = n(px * 0.05) * 0.6 + n(px * 0.013) * 0.4;
    vec3 c = mix(vec3(0.17, 0.11, 0.07), vec3(0.05, 0.035, 0.025), smoothstep(0.1, 1.0, g));
    c *= 0.8 + 0.4 * t;
    o = px.y < uGround ? vec4(0.0) : vec4(c, 1.0);
  } else if (uMode == 2) {
    vec2 v = (vP - uLight) * asp;
    float ang = atan(v.y, v.x);
    float rays = 0.0;
    rays += 0.5 + 0.5 * sin(ang * 11.0 + sin(uTime * 0.11) * 2.0);
    rays *= 0.5 + 0.5 * sin(ang * 9.0 - uTime * 0.05 + 1.3);
    float fall = smoothstep(1.3, 0.1, length(v)) * smoothstep(0.0, 0.15, v.y + 0.1);
    // Broad soft shafts, faded near the source so it doesn't read as a lens star.
    float a = pow(rays, 4.0) * fall * smoothstep(0.05, 0.4, length(v)) * 0.09;
    o = vec4(uRays * a, 0.0);
  } else if (uMode == 3) {
    vec2 q = (vP - 0.5) * asp;
    float v = smoothstep(0.45, 1.05, length(q));
    o = vec4(0.0, 0.0, 0.0, v * 0.75);
  } else {
    float y = (px.y - uGround) / uView.y;
    float m = exp(-y * y * 180.0) * (0.6 + 0.4 * n(vec2(px.x * 0.004 + uTime * 0.02, 0.0)));
    o = vec4(uFogCol * m * 0.45, m * 0.45);
  }
}`;

function program(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  for (const [type, src] of [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
  ] as const) {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
  return p;
}

export class Gl {
  readonly gl: WebGL2RenderingContext;
  private sprite: WebGLProgram;
  private line: WebGLProgram;
  private fillP: WebGLProgram;
  private mesh: WebGLProgram;
  private meshVao: WebGLVertexArrayObject;
  private meshBuf: WebGLBuffer;
  private soilP: WebGLProgram;
  private soilVao: WebGLVertexArrayObject;
  private soilBuf: WebGLBuffer;
  private grid: WebGLVertexArrayObject;
  private gridN: number;
  private quad: WebGLVertexArrayObject;
  private lineVao: WebGLVertexArrayObject;
  private lineBuf: WebGLBuffer;
  private verts: number[] = [];
  private u = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
  theme: Theme = {
    skyLight: [0.95, 0.75, 0.46],
    skyDeep: [0.4, 0.31, 0.19],
    fog: [0.8, 0.62, 0.38],
    tint: [1, 0.95, 0.86],
    rays: [1, 0.82, 0.55],
    soilTop: [0.15, 0.1, 0.065],
    soilBottom: [0.04, 0.03, 0.02],
    thread: [0.93, 0.88, 0.74],
    glow: [1, 0.75, 0.45],
  };
  view: [number, number] = [1280, 720];
  time = 0;
  ground = 430;
  light: [number, number] = [0.22, 0.08];

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: false, preserveDrawingBuffer: true, antialias: true });
    if (!gl) throw new Error('no WebGL2');
    this.gl = gl;
    this.sprite = program(gl, SPRITE_VS, SPRITE_FS);
    this.line = program(gl, LINE_VS, LINE_FS);
    this.fillP = program(gl, FILL_VS, FILL_FS);
    this.mesh = program(gl, MESH_VS, MESH_FS);
    this.meshVao = gl.createVertexArray()!;
    this.meshBuf = gl.createBuffer()!;
    gl.bindVertexArray(this.meshVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meshBuf);
    for (const [name, off] of [
      ['aPos', 0],
      ['aUV', 8],
    ] as const) {
      const loc = gl.getAttribLocation(this.mesh, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 16, off);
    }
    gl.bindVertexArray(null);
    this.soilP = program(gl, SOIL_VS, SOIL_FS);
    this.soilVao = gl.createVertexArray()!;
    this.soilBuf = gl.createBuffer()!;
    gl.bindVertexArray(this.soilVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.soilBuf);
    for (const loc of [0, 1]) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 16, loc * 8);
    }
    gl.bindVertexArray(null);

    // A grid mesh, so sprites can bend (sway, crawl) smoothly.
    const GX = 24,
      GY = 10,
      g: number[] = [];
    for (let j = 0; j < GY; j++)
      for (let i = 0; i < GX; i++) {
        const a = [i / GX, j / GY],
          b = [(i + 1) / GX, j / GY],
          c = [i / GX, (j + 1) / GY],
          d = [(i + 1) / GX, (j + 1) / GY];
        g.push(...a, ...b, ...c, ...b, ...d, ...c);
      }
    this.gridN = g.length / 2;
    this.grid = this.vao(this.sprite, new Float32Array(g));
    this.quad = this.vao(this.fillP, new Float32Array([0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1]));

    this.lineVao = gl.createVertexArray()!;
    this.lineBuf = gl.createBuffer()!;
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    const stride = 8 * 4;
    const at = (name: string, size: number, off: number) => {
      const loc = gl.getAttribLocation(this.line, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off);
    };
    at('aPos', 2, 0);
    at('aCol', 4, 8);
    at('aE', 2, 24);
    gl.bindVertexArray(null);
    gl.enable(gl.BLEND);
  }

  private vao(p: WebGLProgram, data: Float32Array): WebGLVertexArrayObject {
    const gl = this.gl;
    const v = gl.createVertexArray()!;
    gl.bindVertexArray(v);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(p, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return v;
  }

  private loc(p: WebGLProgram, name: string) {
    let m = this.u.get(p);
    if (!m) this.u.set(p, (m = new Map()));
    if (!m.has(name)) m.set(name, this.gl.getUniformLocation(p, name));
    return m.get(name)!;
  }

  /** Uploads an image with mipmaps (the blur), cropped to its opaque bounding box. */
  texture(img: HTMLImageElement | ImageBitmap, crop = true): Tex {
    const gl = this.gl;
    let uv: [number, number, number, number] = [0, 0, 1, 1];
    let w = img.width,
      h = img.height;
    if (crop) {
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const px = g.getImageData(0, 0, w, h).data;
      let x0 = w,
        y0 = h,
        x1 = 0,
        y1 = 0;
      for (let y = 0; y < h; y += 2)
        for (let x = 0; x < w; x += 2)
          if (px[(y * w + x) * 4 + 3]! > 20) {
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
          }
      if (x1 > x0) {
        uv = [x0 / w, y0 / h, (x1 + 2) / w, (y1 + 2) / h];
        w = x1 - x0 + 2;
        h = y1 - y0 + 2;
      }
    }
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return { tex, w, h, uv };
  }

  /** A texture for ribbons: cropped to its opaque box into its own image, repeating mirrored along u. */
  ribbonTexture(img: HTMLImageElement | ImageBitmap): Tex {
    const probe = this.texture(img, true);
    this.gl.deleteTexture(probe.tex);
    const [u0, v0] = probe.uv;
    const c = new OffscreenCanvas(probe.w, probe.h);
    c.getContext('2d')!.drawImage(img, -u0 * img.width, -v0 * img.height);
    const t = this.texture(c.transferToImageBitmap(), false);
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
    return t;
  }

  /**
   * The texture laid along a curve: `top` points are its upper edge, the texture hangs `depth` pixels
   * down along the curve's normal; one texture width covers `tile` pixels of arc length.
   */
  ribbon(
    t: Tex,
    top: { x: number; y: number }[],
    depth: number,
    tile: number,
    o: { fog?: number; blur?: number; bright?: number; fade?: number } = {},
  ): void {
    const gl = this.gl,
      p = this.mesh;
    this.flushLines();
    const v: number[] = [];
    let arc = 0;
    for (let i = 0; i < top.length; i++) {
      const a = top[Math.max(0, i - 1)]!,
        b = top[Math.min(top.length - 1, i + 1)]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      // Normal pointing into the ground; blended with straight down so steep bits don't fold over.
      let nx = -(b.y - a.y) / len,
        ny = (b.x - a.x) / len;
      nx *= 0.6;
      ny = ny * 0.6 + 0.4;
      const nl = Math.hypot(nx, ny);
      nx /= nl;
      ny /= nl;
      if (i > 0) arc += Math.hypot(top[i]!.x - top[i - 1]!.x, top[i]!.y - top[i - 1]!.y);
      const u = arc / tile;
      const P = top[i]!;
      v.push(P.x, P.y, u, 0, P.x + nx * depth, P.y + ny * depth, u, 1);
    }
    const tri: number[] = [];
    for (let i = 0; i + 1 < top.length; i++) {
      const q = (k: number) => v.slice(k * 4, k * 4 + 4);
      const a = q(i * 2),
        b = q(i * 2 + 1),
        c = q(i * 2 + 2),
        d = q(i * 2 + 3);
      tri.push(...a, ...b, ...c, ...c, ...b, ...d);
    }
    gl.useProgram(p);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform2f(this.loc(p, 'uView'), ...this.view);
    gl.uniform1f(this.loc(p, 'uFog'), o.fog ?? 0);
    gl.uniform3f(this.loc(p, 'uFogCol'), ...this.theme.fog);
    gl.uniform3f(this.loc(p, 'uTint'), ...this.theme.tint);
    gl.uniform1f(this.loc(p, 'uBlur'), o.blur ?? 0);
    gl.uniform1f(this.loc(p, 'uBright'), o.bright ?? 1);
    gl.uniform1f(this.loc(p, 'uFade'), o.fade ?? 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.uniform1i(this.loc(p, 'uTex'), 0);
    gl.bindVertexArray(this.meshVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meshBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(tri), gl.STREAM_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, tri.length / 4);
  }

  /** The soil variants as one texture array (same size each), mipmapped and repeating, for `soil()`. */
  soilTextures(imgs: ImageBitmap[]): WebGLTexture {
    const gl = this.gl;
    const { width: w, height: h } = imgs[0]!;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, Math.floor(Math.log2(Math.max(w, h))) + 1, gl.RGBA8, w, h, imgs.length);
    imgs.forEach((b, i) => gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, w, h, 1, gl.RGBA, gl.UNSIGNED_BYTE, b));
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }

  /**
   * Soil below a curve, hex-tiled from the variants in `soils` (`soilTextures`). `top` is the surface, `cam` how far
   * the world has scrolled (the soil moves with it), `tile` the view units one texture repeat covers.
   * `bands`: depths where leafy humus turns dark, dark turns plain, plain turns stony.
   */
  soil(
    soils: WebGLTexture,
    top: { x: number; y: number }[],
    bottom: number,
    cam: number,
    o: { tile: number; patch?: number; macro?: number; bright?: number; bands?: [number, number, number] },
  ): void {
    const gl = this.gl,
      p = this.soilP;
    this.flushLines();
    const tri: number[] = [];
    for (let i = 0; i + 1 < top.length; i++) {
      const a = top[i]!,
        b = top[i + 1]!;
      const A = [a.x, a.y, a.x - cam, 0],
        B = [b.x, b.y, b.x - cam, 0],
        C = [a.x, bottom, a.x - cam, bottom - a.y],
        D = [b.x, bottom, b.x - cam, bottom - b.y];
      tri.push(...A, ...B, ...C, ...B, ...D, ...C);
    }
    const [b0, b1, b2] = o.bands ?? [40, 110, 200];
    gl.useProgram(p);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform2f(this.loc(p, 'uView'), ...this.view);
    gl.uniform1f(this.loc(p, 'uTile'), o.tile);
    gl.uniform1f(this.loc(p, 'uPatch'), o.patch ?? 1);
    gl.uniform1f(this.loc(p, 'uMacro'), o.macro ?? 0.5);
    gl.uniform1f(this.loc(p, 'uBright'), o.bright ?? 1);
    gl.uniform4f(this.loc(p, 'uBands'), b0, b1, b2, 0);
    gl.uniform3f(this.loc(p, 'uTint'), ...this.theme.tint);
    gl.uniform3f(this.loc(p, 'uDeep'), ...this.theme.soilBottom);
    gl.uniform1f(this.loc(p, 'uDeepAt'), this.view[1] - this.ground);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, soils);
    gl.uniform1i(this.loc(p, 'uSoil'), 0);
    gl.bindVertexArray(this.soilVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.soilBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(tri), gl.STREAM_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, tri.length / 4);
  }

  /** A vertical gradient filled below a curve (soil under curved ground). Colours are straight RGBA. */
  below(
    top: { x: number; y: number }[],
    bottom: number,
    from: [number, number, number, number],
    to: [number, number, number, number],
  ): void {
    if (this.additive) this.flushLines();
    this.additive = false;
    for (let i = 0; i + 1 < top.length; i++) {
      const a = top[i]!,
        b = top[i + 1]!;
      const A = [a.x, a.y, ...from],
        B = [b.x, b.y, ...from],
        C = [a.x, bottom, ...to],
        D = [b.x, bottom, ...to];
      for (const q of [A, B, C, B, D, C]) this.verts.push(q[0]!, q[1]!, q[2]!, q[3]!, q[4]!, q[5]!, 0, 0);
    }
  }

  begin(): void {
    const gl = this.gl;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  draw(t: Tex, o: SpriteOpts): void {
    const gl = this.gl,
      p = this.sprite;
    this.flushLines();
    const cell = o.cell ?? [0, 0, 1, 1];
    const [u0, v0, u1, v1] = t.uv;
    const uv = [u0 + (u1 - u0) * cell[0], v0 + (v1 - v0) * cell[1], u0 + (u1 - u0) * cell[2], v0 + (v1 - v0) * cell[3]];
    const aspect = (t.w * (cell[2] - cell[0])) / (t.h * (cell[3] - cell[1]));
    const w = o.w ?? o.h * aspect;
    gl.useProgram(p);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform4f(this.loc(p, 'uRect'), o.x - w / 2, o.y - o.h, w, o.h);
    gl.uniform2f(this.loc(p, 'uView'), ...this.view);
    gl.uniform4f(this.loc(p, 'uUV'), uv[0]!, uv[1]!, uv[2]!, uv[3]!);
    gl.uniform4f(this.loc(p, 'uSway'), o.sway ?? 0, o.swayPhase ?? 0, 0, 0);
    gl.uniform3f(this.loc(p, 'uCrawl'), ...(o.crawl ?? [0, 0, 1]));
    gl.uniform1f(this.loc(p, 'uFlip'), o.flip ? 1 : 0);
    gl.uniform1f(this.loc(p, 'uFog'), o.fog ?? 0);
    gl.uniform3f(this.loc(p, 'uFogCol'), ...this.theme.fog);
    gl.uniform3f(this.loc(p, 'uTint'), ...this.theme.tint);
    gl.uniform1f(this.loc(p, 'uBlur'), o.blur ?? 0);
    gl.uniform1f(this.loc(p, 'uBright'), o.bright ?? 1);
    gl.uniform1f(this.loc(p, 'uAlpha'), o.alpha ?? 1);
    gl.uniform1f(this.loc(p, 'uGlow'), o.glow ?? 0);
    gl.uniform1f(this.loc(p, 'uFade'), o.fade ?? 0);
    gl.uniform1f(this.loc(p, 'uEdge'), o.edge ?? 0);
    gl.uniform1f(this.loc(p, 'uRot'), o.rot ?? 0);
    gl.uniform3f(this.loc(p, 'uFoot'), ...(o.foot ?? [1, 0, 0]));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.uniform1i(this.loc(p, 'uTex'), 0);
    gl.bindVertexArray(this.grid);
    gl.drawArrays(gl.TRIANGLES, 0, this.gridN);
  }

  private additive = false;

  /** A soft line segment; batched until the next sprite or fill. */
  seg(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    w: number,
    r: number,
    g: number,
    b: number,
    a: number,
    add = false,
    round = false,
  ): void {
    if (add !== this.additive) this.flushLines();
    this.additive = add;
    const dx = x1 - x0,
      dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    // Round-ish ends: extend by half the width.
    const ex = (dx / len) * w * 0.5,
      ey = (dy / len) * w * 0.5;
    const nx = (-dy / len) * w * 0.5,
      ny = (dx / len) * w * 0.5;
    // Across the line the alpha falls off; for dots also along it, so they come out round.
    const e = round ? 1 : 0;
    const A = [x0 - ex + nx, y0 - ey + ny, 1, -e],
      B = [x0 - ex - nx, y0 - ey - ny, -1, -e],
      C = [x1 + ex + nx, y1 + ey + ny, 1, e],
      D = [x1 + ex - nx, y1 + ey - ny, -1, e];
    for (const v of [A, B, C, B, D, C]) this.verts.push(v[0]!, v[1]!, r, g, b, a, v[2]!, v[3]!);
  }

  dot(x: number, y: number, rad: number, r: number, g: number, b: number, a: number, add = true): void {
    this.seg(x - rad * 0.01, y, x + rad * 0.01, y, rad * 2, r, g, b, a, add, true);
  }

  flushLines(): void {
    if (!this.verts.length) return;
    const gl = this.gl,
      p = this.line;
    gl.useProgram(p);
    if (this.additive) gl.blendFunc(gl.ONE, gl.ONE);
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform2f(this.loc(p, 'uView'), ...this.view);
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.verts), gl.STREAM_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, this.verts.length / 8);
    this.verts = [];
  }

  fill(mode: number): void {
    const gl = this.gl,
      p = this.fillP;
    this.flushLines();
    gl.useProgram(p);
    if (mode === 2) gl.blendFunc(gl.ONE, gl.ONE);
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1i(this.loc(p, 'uMode'), mode);
    gl.uniform1f(this.loc(p, 'uTime'), this.time);
    gl.uniform2f(this.loc(p, 'uView'), ...this.view);
    gl.uniform1f(this.loc(p, 'uGround'), this.ground);
    gl.uniform2f(this.loc(p, 'uLight'), ...this.light);
    gl.uniform3f(this.loc(p, 'uSkyLight'), ...this.theme.skyLight);
    gl.uniform3f(this.loc(p, 'uSkyDeep'), ...this.theme.skyDeep);
    gl.uniform3f(this.loc(p, 'uRays'), ...this.theme.rays);
    gl.uniform3f(this.loc(p, 'uFogCol'), ...this.theme.fog);
    gl.bindVertexArray(this.quad);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}
