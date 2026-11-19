// WebGL2 programs for every mode that draws with it: compiled from sources put together by src/engine/shaders.ts,
// their uniforms set by name. Knows no mode.

export type GL = WebGL2RenderingContext;

/** a stage's source put together from files (src/engine/shaders.ts): `#line 1 n` starts file n, `files[n]` names it */
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
    // column-major, as GL wants them
    case gl.FLOAT_MAT2:
      return (v) => gl.uniformMatrix2fv(loc, false, v as Float32List);
    case gl.FLOAT_MAT3:
      return (v) => gl.uniformMatrix3fv(loc, false, v as Float32List);
    case gl.FLOAT_MAT4:
      return (v) => gl.uniformMatrix4fv(loc, false, v as Float32List);
  }
  throw new Error(`uniform type 0x${type.toString(16)}: no setter`);
}
