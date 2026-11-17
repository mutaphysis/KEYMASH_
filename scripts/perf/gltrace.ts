// Instruments a WebGL2 context for the perf harness (scripts/perf.ts). Every draw is put in a group, named after the
// fragment shader its program was linked with (and whatever the caller reads from the program's int uniforms), and
// can then be skipped, timed on the GPU (EXT_disjoint_timer_query_webgl2), drawn with uniforms overridden, or, while
// `counting`, drawn with its own vertex shader and a fragment shader that adds one 1/255 step per fragment, which
// turns each target into an overdraw map. It patches the context object's own methods, so the renderer under test
// runs unchanged; the renderer is built inside traced(), which hands out the context it asks for.

type GL = WebGL2RenderingContext;

export interface TraceOptions {
  /** fragment shader source → name */
  names: Map<string, string>;
  /** a draw's group from its program's name and the int uniforms last set on that program */
  group?: (program: string, ints: Readonly<Record<string, number>>) => string;
}

export interface Draw {
  group: string;
  /** the nth draw of its group this frame */
  n: number;
  /** what it drew into: null is the canvas */
  fbo: WebGLFramebuffer | null;
  /** vertices or indices */
  count: number;
  mode: number;
  query: WebGLQuery | null;
}

/** a fragment = 1/255 of red, added up: a texel of the target counts how many fragments were shaded there */
const COUNT_FS = '#version 300 es\nprecision mediump float;\nout vec4 o;\nvoid main() { o = vec4(1.0 / 255.0); }\n';

type Setter = (gl: GL, loc: WebGLUniformLocation, v: number[]) => void;
const C = WebGL2RenderingContext;
const SETTERS: Record<number, Setter> = {
  [C.FLOAT]: (gl, l, v) => gl.uniform1fv(l, v),
  [C.FLOAT_VEC2]: (gl, l, v) => gl.uniform2fv(l, v),
  [C.FLOAT_VEC3]: (gl, l, v) => gl.uniform3fv(l, v),
  [C.FLOAT_VEC4]: (gl, l, v) => gl.uniform4fv(l, v),
  [C.INT]: (gl, l, v) => gl.uniform1iv(l, v),
  [C.BOOL]: (gl, l, v) => gl.uniform1iv(l, v),
  [C.INT_VEC2]: (gl, l, v) => gl.uniform2iv(l, v),
  [C.INT_VEC3]: (gl, l, v) => gl.uniform3iv(l, v),
  [C.INT_VEC4]: (gl, l, v) => gl.uniform4iv(l, v),
};

/** the uniform setters, recorded so a counting program gets its original's vertex uniforms */
const UNIFORMS = [
  ...['1f', '2f', '3f', '4f', '1i', '2i', '3i', '4i', '1ui', '2ui', '3ui', '4ui'],
  ...['1fv', '2fv', '3fv', '4fv', '1iv', '2iv', '3iv', '4iv', '1uiv', '2uiv', '3uiv', '4uiv'],
  ...['Matrix2fv', 'Matrix3fv', 'Matrix4fv'],
].map((s) => `uniform${s}`);
type UniformCall = (loc: WebGLUniformLocation | null, ...args: unknown[]) => void;

interface TimerExt {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}

export class GLTrace {
  readonly gl: GL;
  /** null: this GPU (or a software one) can't time draws */
  readonly timer: TimerExt | null;
  /** groups, or single draws (`group#n`), not drawn */
  skip = new Set<string>();
  /** when set, only these groups or draws are drawn; while counting the others still are, colour masked, so what
   * they hide in the depth buffer stays hidden (a counting twin has no discard: a cut-out draw hides its whole mesh) */
  only: Set<string> | null = null;
  /** uniform name (without [0]) → values, set before every draw whose program has it */
  overrides: Record<string, number[]> = {};
  /** wrap every draw in a timer query (only with `timer`) */
  timing = false;
  /** draw fragment counts instead of colours: every target bound is cleared, every fragment adds 1/255 */
  counting = false;
  /** this frame's draws, since begin() */
  draws: Draw[] = [];
  /** each framebuffer's size, as the viewport last set while it was bound */
  sizes = new Map<WebGLFramebuffer | null, [number, number]>();

  private raw: Pick<
    GL,
    | 'createShader'
    | 'shaderSource'
    | 'compileShader'
    | 'attachShader'
    | 'getUniformLocation'
    | 'bindFramebuffer'
    | 'useProgram'
    | 'enable'
    | 'disable'
    | 'blendFunc'
    | 'drawArrays'
    | 'drawElements'
  >;
  private rawUniform = new Map<string, UniformCall>();
  private shaderType = new WeakMap<WebGLShader, number>();
  private shaderSrc = new WeakMap<WebGLShader, string>();
  private progName = new WeakMap<WebGLProgram, string>();
  private progVs = new WeakMap<WebGLProgram, string>();
  /** per program: the last call that set each uniform, by name */
  private progValues = new WeakMap<WebGLProgram, Map<string, [string, unknown[]]>>();
  private progUniforms = new WeakMap<WebGLProgram, Map<string, { loc: WebGLUniformLocation; set: Setter }>>();
  private counters = new WeakMap<WebGLProgram, { prog: WebGLProgram; locs: Map<string, WebGLUniformLocation | null> }>();
  private locName = new WeakMap<WebGLUniformLocation, string>();
  private prog: WebGLProgram | null = null;
  private fbo: WebGLFramebuffer | null = null;
  /** the renderer's blending, restored after a counting draw */
  private blend = false;
  private blendFn: [number, number] = [C.ONE, C.ZERO];
  private groupOf: NonNullable<TraceOptions['group']>;
  private nth = new Map<string, number>();
  private pool: WebGLQuery[] = [];

  constructor(gl: GL, opts: TraceOptions) {
    this.gl = gl;
    this.groupOf = opts.group ?? ((p) => p);
    this.timer = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
    const raw = (this.raw = {
      createShader: gl.createShader.bind(gl),
      shaderSource: gl.shaderSource.bind(gl),
      compileShader: gl.compileShader.bind(gl),
      attachShader: gl.attachShader.bind(gl),
      getUniformLocation: gl.getUniformLocation.bind(gl),
      bindFramebuffer: gl.bindFramebuffer.bind(gl),
      useProgram: gl.useProgram.bind(gl),
      enable: gl.enable.bind(gl),
      disable: gl.disable.bind(gl),
      blendFunc: gl.blendFunc.bind(gl),
      drawArrays: gl.drawArrays.bind(gl),
      drawElements: gl.drawElements.bind(gl),
    });
    const viewport = gl.viewport.bind(gl);
    const g = gl as unknown as Record<string, UniformCall>;

    gl.createShader = (type) => {
      const s = raw.createShader(type);
      if (s) this.shaderType.set(s, type);
      return s;
    };
    gl.shaderSource = (s, src) => {
      this.shaderSrc.set(s, src);
      raw.shaderSource(s, src);
    };
    gl.attachShader = (p, s) => {
      const src = this.shaderSrc.get(s) ?? '';
      if (this.shaderType.get(s) === gl.FRAGMENT_SHADER) this.progName.set(p, opts.names.get(src) ?? 'unnamed');
      else this.progVs.set(p, src);
      raw.attachShader(p, s);
    };
    gl.getUniformLocation = (p, name) => {
      const l = raw.getUniformLocation(p, name);
      if (l) this.locName.set(l, name.replace(/\[0\]$/, ''));
      return l;
    };
    gl.useProgram = (p) => {
      this.prog = p;
      raw.useProgram(p);
    };
    for (const m of UNIFORMS) {
      const f = g[m]!.bind(gl);
      this.rawUniform.set(m, f);
      g[m] = (l, ...args) => {
        const name = l && this.locName.get(l);
        if (name && this.prog) {
          let values = this.progValues.get(this.prog);
          if (!values) this.progValues.set(this.prog, (values = new Map()));
          values.set(name, [m, args]);
        }
        f(l, ...args);
      };
    }
    gl.bindFramebuffer = (target, fb) => {
      raw.bindFramebuffer(target, fb);
      this.fbo = fb;
      // counting starts every target empty (the renderer never clears: its sky covers everything)
      if (this.counting) {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
    };
    gl.viewport = (x, y, w, h) => {
      this.sizes.set(this.fbo, [w, h]);
      viewport(x, y, w, h);
    };
    // a target the renderer replaced (its size changed) is no longer one to read or wait for
    const deleteFramebuffer = gl.deleteFramebuffer.bind(gl);
    gl.deleteFramebuffer = (fb) => {
      if (fb) this.sizes.delete(fb);
      deleteFramebuffer(fb);
    };
    gl.enable = (cap) => {
      if (cap === gl.BLEND) this.blend = true;
      raw.enable(cap);
    };
    gl.disable = (cap) => {
      if (cap === gl.BLEND) this.blend = false;
      raw.disable(cap);
    };
    gl.blendFunc = (s, d) => {
      this.blendFn = [s, d];
      raw.blendFunc(s, d);
    };
    gl.drawArrays = (mode, first, count) => this.draw(mode, count, () => raw.drawArrays(mode, first, count));
    gl.drawElements = (mode, count, type, offset) => this.draw(mode, count, () => raw.drawElements(mode, count, type, offset));
  }

  /** a new frame: forget the last one's draws */
  begin(): void {
    this.draws = [];
    this.nth.clear();
  }

  /** waits until the GPU has finished everything sent so far: a texel read from every target, so no driver can
   * leave work it thinks unrelated in its queue */
  sync(): void {
    const gl = this.gl;
    const px = new Uint8Array(4);
    for (const fb of this.sizes.keys()) {
      this.raw.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    }
    this.raw.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
  }

  /** GPU nanoseconds per draw of `draws` (timed ones; 0 for the rest), or null if the GPU was disjoint meanwhile (a
   * power state change: the numbers are meaningless). Results arrive a task or more after the frame */
  async times(draws: Draw[]): Promise<number[] | null> {
    const gl = this.gl;
    const t = this.timer;
    if (!t) return null;
    const queries = draws.map((d) => d.query).filter((q): q is WebGLQuery => !!q);
    const last = queries[queries.length - 1];
    for (let i = 0; last && !gl.getQueryParameter(last, gl.QUERY_RESULT_AVAILABLE); i++) {
      if (i > 200) throw new Error('timer queries never arrived');
      await new Promise((r) => setTimeout(r, 5));
    }
    const disjoint = gl.getParameter(t.GPU_DISJOINT_EXT) as boolean;
    const ns = draws.map((d) => (d.query ? (gl.getQueryParameter(d.query, gl.QUERY_RESULT) as number) : 0));
    this.pool.push(...queries);
    for (const d of draws) d.query = null;
    return disjoint ? null : ns;
  }

  /** the texels of framebuffer `fbo` (null: the canvas), bottom row first */
  read(fbo: WebGLFramebuffer | null): { w: number; h: number; px: Uint8Array } {
    const gl = this.gl;
    const [w, h] = this.sizes.get(fbo) ?? [gl.drawingBufferWidth, gl.drawingBufferHeight];
    const px = new Uint8Array(w * h * 4);
    this.raw.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    this.raw.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    return { w, h, px };
  }

  private draw(mode: number, count: number, run: () => void): void {
    const p = this.prog;
    const name = (p && this.progName.get(p)) || 'unnamed';
    const ints: Record<string, number> = {};
    for (const [k, [m, args]] of (p && this.progValues.get(p)) || []) if (m === 'uniform1i') ints[k] = args[0] as number;
    const group = this.groupOf(name, ints);
    // numbered before skipping, so a draw keeps its label whatever else is left out
    const n = this.nth.get(group) ?? 0;
    this.nth.set(group, n + 1);
    const label = `${group}#${n}`;
    const other = !!this.only && !this.only.has(group) && !this.only.has(label);
    if (this.skip.has(group) || this.skip.has(label) || (other && !this.counting)) return;
    this.override();
    const counting = this.counting && p ? this.countWith(p) : null;
    if (other) this.gl.colorMask(false, false, false, false);
    const t = this.timing ? this.timer : null;
    const query = t ? (this.pool.pop() ?? this.gl.createQuery()) : null;
    if (t && query) this.gl.beginQuery(t.TIME_ELAPSED_EXT, query);
    run();
    if (t && query) this.gl.endQuery(t.TIME_ELAPSED_EXT);
    if (other) this.gl.colorMask(true, true, true, true);
    if (counting) this.uncount();
    if (other) return;
    this.draws.push({ group, n, fbo: this.fbo, count, mode, query });
  }

  /** switches to program p's counting twin (made on first use), with p's uniforms and additive blending */
  private countWith(p: WebGLProgram): WebGLProgram {
    const gl = this.gl;
    let c = this.counters.get(p);
    if (!c) {
      const prog = gl.createProgram();
      for (const [type, src] of [
        [gl.VERTEX_SHADER, this.progVs.get(p) ?? ''],
        [gl.FRAGMENT_SHADER, COUNT_FS],
      ] as const) {
        const s = this.raw.createShader(type)!;
        this.raw.shaderSource(s, src);
        this.raw.compileShader(s);
        this.raw.attachShader(prog, s);
      }
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('counting program: ' + gl.getProgramInfoLog(prog));
      this.counters.set(p, (c = { prog, locs: new Map() }));
    }
    this.raw.useProgram(c.prog);
    for (const [name, [m, args]] of this.progValues.get(p) ?? []) {
      let loc = c.locs.get(name);
      if (loc === undefined) c.locs.set(name, (loc = this.raw.getUniformLocation(c.prog, name)));
      if (loc) this.rawUniform.get(m)!(loc, ...args);
    }
    this.raw.enable(gl.BLEND);
    this.raw.blendFunc(gl.ONE, gl.ONE);
    return c.prog;
  }

  /** back to the renderer's program and blending */
  private uncount(): void {
    this.raw.useProgram(this.prog);
    if (!this.blend) this.raw.disable(this.gl.BLEND);
    this.raw.blendFunc(...this.blendFn);
  }

  /** sets the overridden uniforms the current program has (looked up once per program) */
  private override(): void {
    const p = this.prog;
    if (!p) return;
    const names = Object.keys(this.overrides);
    if (!names.length) return;
    let all = this.progUniforms.get(p);
    if (!all) {
      const gl = this.gl;
      all = new Map();
      const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number;
      for (let i = 0; i < n; i++) {
        const info = gl.getActiveUniform(p, i);
        const set = info && SETTERS[info.type];
        const loc = info && this.raw.getUniformLocation(p, info.name);
        if (info && set && loc) all.set(info.name.replace(/\[0\]$/, ''), { loc, set });
      }
      this.progUniforms.set(p, all);
    }
    for (const name of names) {
      const u = all.get(name);
      if (u) u.set(this.gl, u.loc, this.overrides[name]!);
    }
  }
}

/**
 * Runs `make` (which creates the renderer and with it its context) with every WebGL2 context it gets traced; returns
 * what it made and the trace of the first such context.
 */
export function traced<T>(opts: TraceOptions, make: () => T): { value: T; trace: GLTrace } {
  const proto = HTMLCanvasElement.prototype;
  const get = proto.getContext;
  let trace: GLTrace | null = null;
  proto.getContext = function (this: HTMLCanvasElement, id: string, attrs?: unknown) {
    const c = get.call(this, id, attrs as never);
    if (id === 'webgl2' && c && !trace) trace = new GLTrace(c as GL, opts);
    return c;
  } as typeof get;
  try {
    const value = make();
    if (!trace) throw new Error('traced(): nothing asked for a WebGL2 context');
    return { value, trace };
  } finally {
    proto.getContext = get;
  }
}
