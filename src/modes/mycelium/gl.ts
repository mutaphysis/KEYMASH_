// The little WebGL2 that MYCELIUM_ needs: programs, meshes, an offscreen target, textures from decoded pictures.
// Everything is 2D (a side view panned in x and y), so no matrices.

export type GL = WebGL2RenderingContext;

/** a stage's source put together from files (shaders/index.ts): `#line 1 n` starts file n, `files[n]` names it */
export interface Source {
  text: string;
  files: readonly string[];
}

/** a uniform's value: numbers for floats and ints (scalars, vectors, arrays alike), a texture for a sampler */
export type Value = number | Float32List | Int32List | WebGLTexture | null;
export type Values = Readonly<Record<string, Value>>;

/** where a compile error points, in the files rather than the assembled source */
export interface ShaderAt {
  file: string;
  line: number;
  text: string;
}

/** a program that didn't compile or link: its log, each line moved to the file it came from */
export class ShaderError extends Error {
  constructor(
    readonly program: string,
    readonly log: string,
    readonly at: ShaderAt[],
  ) {
    super(program ? `${program}: ${log}` : log);
  }
}

const SAMPLERS: Record<number, number> = {
  [WebGL2RenderingContext.SAMPLER_2D]: WebGL2RenderingContext.TEXTURE_2D,
  [WebGL2RenderingContext.SAMPLER_2D_ARRAY]: WebGL2RenderingContext.TEXTURE_2D_ARRAY,
  [WebGL2RenderingContext.SAMPLER_3D]: WebGL2RenderingContext.TEXTURE_3D,
  [WebGL2RenderingContext.SAMPLER_CUBE]: WebGL2RenderingContext.TEXTURE_CUBE_MAP,
};

/** a compile and link queued with the driver, its outcome not asked for yet */
interface Linking {
  prog: WebGLProgram;
  stages: [WebGLShader, Source][];
}

/**
 * A linked program and a setter per active uniform, picked by its GLSL type: `set({ uTint: AIR.tint, uStrip: tex })`.
 * Each sampler has a texture unit of its own, so setting one binds the texture there. A name the program's source
 * doesn't declare throws (a typo); one it declares but the compiler dropped is skipped.
 */
export class Program {
  prog!: WebGLProgram;
  private setters = new Map<string, (v: Value) => void>();
  private declared = new Set<string>();
  private linking: Linking | null;

  /** queues the compile and link; link() takes the outcome (programs() lets the driver finish first) */
  constructor(
    private gl: GL,
    readonly name: string,
    vs: Source,
    fs: Source,
  ) {
    this.linking = this.queue(vs, fs);
  }

  /** compile and link again (a hot-reloaded shader), waiting for it; throws a ShaderError and keeps what it had */
  relink(vs: Source, fs: Source): void {
    this.linking = this.queue(vs, fs);
    this.link();
  }

  /** whether the driver is done with the queued link, so link() won't wait for it (KHR_parallel_shader_compile's
   * COMPLETION_STATUS_KHR) */
  done(completion: number): boolean {
    const l = this.linking;
    return !l || this.gl.isContextLost() || !!this.gl.getProgramParameter(l.prog, completion);
  }

  /** the queued link's outcome: the program and its setters, or a ShaderError (keeping the program it had) */
  link(): void {
    const gl = this.gl;
    const l = this.linking;
    if (!l) return;
    this.linking = null;
    if (!gl.getProgramParameter(l.prog, gl.LINK_STATUS) && !gl.isContextLost()) {
      // a stage that didn't compile says why (asked only now: each status query waits for the driver); else the link
      const failed = l.stages.find(([sh]) => !gl.getShaderParameter(sh, gl.COMPILE_STATUS));
      const e = failed
        ? this.compileError(failed[0], failed[1])
        : new ShaderError(this.name, `link: ${(gl.getProgramInfoLog(l.prog) ?? '').replace(/\0/g, '').trim()}`, []);
      for (const [sh] of l.stages) gl.deleteShader(sh);
      gl.deleteProgram(l.prog);
      throw e;
    }
    for (const [sh] of l.stages) gl.deleteShader(sh);
    if (this.prog) gl.deleteProgram(this.prog);
    this.prog = l.prog;
    this.setters.clear();
    this.declared = declared(l.stages.map(([, src]) => src.text).join('\n'));
    gl.useProgram(l.prog);
    const n = gl.getProgramParameter(l.prog, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0, unit = 0; i < n; i++) {
      const info = gl.getActiveUniform(l.prog, i);
      const loc = info && gl.getUniformLocation(l.prog, info.name);
      if (info && loc) this.setters.set(info.name.replace(/\[0\]$/, ''), setter(gl, info.type, loc, SAMPLERS[info.type] ? unit++ : -1));
    }
  }

  /** this program from now on, with the uniforms of `shared` it has (a frame's common values), then `own` */
  use(shared: Values | null, own?: Values): void {
    this.gl.useProgram(this.prog);
    if (shared) for (const k in shared) this.setters.get(k)?.(shared[k]!);
    if (own) this.set(own);
  }

  /** uniforms of the program in use */
  set(own: Values): void {
    for (const k in own) {
      const f = this.setters.get(k);
      if (f) f(own[k]!);
      else if (!this.declared.has(k)) throw new Error(`${this.name}: no uniform ${k}`);
    }
  }

  private queue(vs: Source, fs: Source): Linking {
    const gl = this.gl;
    const prog = gl.createProgram()!;
    const stages = ([gl.VERTEX_SHADER, gl.FRAGMENT_SHADER] as const).map((type, i): [WebGLShader, Source] => {
      const src = i ? fs : vs;
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src.text);
      gl.compileShader(sh);
      gl.attachShader(prog, sh);
      return [sh, src];
    });
    gl.linkProgram(prog);
    return { prog, stages };
  }

  /** ANGLE's log ("ERROR: <source string>:<line>: <what>", one per line, NUL at the end) with each line moved to the
   * file it came from */
  private compileError(sh: WebGLShader, src: Source): ShaderError {
    const log = (this.gl.getShaderInfoLog(sh) ?? '').replace(/\0/g, '').trim();
    const at: ShaderAt[] = [];
    const mapped = log.replace(/^(ERROR|WARNING): (\d+):(\d+): (.*)$/gm, (_, kind: string, n: string, line: string, text: string) => {
      const file = src.files[+n] ?? '?';
      at.push({ file, line: +line, text });
      return `${kind}: ${file}:${line}: ${text}`;
    });
    return new ShaderError(this.name, mapped, at);
  }
}

/** the uniform names a source declares, comments left out */
function declared(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.replace(/\/\/.*$/gm, '').matchAll(/\buniform\s+(?:(?:highp|mediump|lowp)\s+)?\w+\s+([^;{]+);/g))
    for (const name of m[1]!.split(',')) out.add(name.replace(/\[.*$/, '').trim());
  return out;
}

/** how a uniform of this type is set; a sampler is given its unit here and binds its texture there when set */
function setter(gl: GL, type: number, loc: WebGLUniformLocation, unit: number): (v: Value) => void {
  const target = SAMPLERS[type];
  if (target !== undefined) {
    gl.uniform1i(loc, unit);
    return (v) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(target, v as WebGLTexture | null);
    };
  }
  switch (type) {
    case gl.FLOAT:
      return (v) => (typeof v === 'number' ? gl.uniform1f(loc, v) : gl.uniform1fv(loc, v as Float32List));
    case gl.FLOAT_VEC2:
      return (v) => gl.uniform2fv(loc, v as Float32List);
    case gl.FLOAT_VEC3:
      return (v) => gl.uniform3fv(loc, v as Float32List);
    case gl.FLOAT_VEC4:
      return (v) => gl.uniform4fv(loc, v as Float32List);
    case gl.INT:
    case gl.BOOL:
      return (v) => (typeof v === 'number' ? gl.uniform1i(loc, v) : gl.uniform1iv(loc, v as Int32List));
    case gl.INT_VEC2:
      return (v) => gl.uniform2iv(loc, v as Int32List);
    case gl.INT_VEC3:
      return (v) => gl.uniform3iv(loc, v as Int32List);
    case gl.INT_VEC4:
      return (v) => gl.uniform4iv(loc, v as Int32List);
  }
  throw new Error(`uniform type 0x${type.toString(16)}: no setter`);
}

/** a float vertex buffer of `bytes`, refilled with bufferSubData as the meshes change */
export function vertexBuffer(gl: GL, bytes: number): WebGLBuffer {
  const vbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, bytes, gl.DYNAMIC_DRAW);
  return vbo;
}

/**
 * A vertex array over `vbo`, interleaved floats: attribute i (the shaders' `layout(location = i)`) takes `sizes[i]`
 * of them, one after the other, so a vertex is their sum. `indices` become its element buffer. A wireframe is a second
 * one over the same buffer with line indices (its shader reads location 0 only).
 */
export function vao(gl: GL, vbo: WebGLBuffer, sizes: readonly number[], indices: Uint16Array): WebGLVertexArrayObject {
  const v = gl.createVertexArray()!;
  gl.bindVertexArray(v);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  const stride = sizes.reduce((s, n) => s + n, 0) * 4;
  let at = 0;
  sizes.forEach((n, i) => {
    gl.enableVertexAttribArray(i);
    gl.vertexAttribPointer(i, n, gl.FLOAT, false, stride, at);
    at += n * 4;
  });
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return v;
}

export interface Target {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture;
  /** painter's order as depth (render.ts), so opaque layers in front hide what is behind them before it is shaded */
  depth: WebGLRenderbuffer;
  w: number;
  h: number;
}

/** RGBA8 colour, linear filter, clamped; a 16-bit depth buffer beside it */
export function target(gl: GL, w: number, h: number): Target {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const depth = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, tex, depth, w, h };
}

export function freeTarget(gl: GL, t: Target): void {
  gl.deleteFramebuffer(t.fbo);
  gl.deleteTexture(t.tex);
  gl.deleteRenderbuffer(t.depth);
}

export type Wrap = 'clamp' | 'repeat' | 'mirror';

const MAX_LEVELS = (w: number, h: number) => Math.floor(Math.log2(Math.max(w, h))) + 1;

/**
 * A mipmapped texture from a premultiplied bitmap (the preloader decodes with premultiplyAlpha), so blending and
 * mipmaps never bleed the colour of transparent texels into edges. `wrapS`/`wrapT` as GL wraps.
 */
export function texture(gl: GL, src: ImageBitmap, wrapS: Wrap, wrapT: Wrap): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texStorage2D(gl.TEXTURE_2D, MAX_LEVELS(src.width, src.height), gl.RGBA8, src.width, src.height);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, src);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, glWrap(gl, wrapS));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, glWrap(gl, wrapT));
  return tex;
}

/** pictures of one size as the layers of a repeating, mipmapped array texture (the soil horizons) */
export function textureArray(gl: GL, layers: ImageBitmap[]): WebGLTexture {
  const { width: w, height: h } = layers[0]!;
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, MAX_LEVELS(w, h), gl.RGBA8, w, h, layers.length);
  layers.forEach((b, i) => gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, w, h, 1, gl.RGBA, gl.UNSIGNED_BYTE, b));
  gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return tex;
}

function glWrap(gl: GL, w: Wrap): number {
  return w === 'mirror' ? gl.MIRRORED_REPEAT : w === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE;
}
