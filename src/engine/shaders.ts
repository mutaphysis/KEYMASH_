// A mode's shaders, one GLSL piece per file in its shaders/ folder. A file pulls in the pieces it uses with
// `#include "x.glsl"`: each piece once per stage, where it is first asked for, so a piece includes what it needs
// itself. The mode's shaders/index.ts names its programs (vertex stage, fragment stage, what else each #defines) and
// hands its files over (import.meta.glob); `#line` keeps every file's own numbering, so a compile error names the file
// and line it came from.
// All programs are queued at once; with KHR_parallel_shader_compile the driver compiles them on its own threads while
// the page goes on, and their outcome is asked for only once all are done: asking any sooner would wait for it.
// In dev, saving a shader file relinks the programs it changed in place, without reloading the page; one that doesn't
// compile keeps its old program and shows its error in Vite's overlay. Knows no mode.
import { Program, ShaderError } from './gl';
import type { GL, ShaderAt, Source } from './gl';

/** per program: its vertex stage, its fragment stage, then what else it #defines */
export type ProgramTable = Record<string, readonly [string, string, ...string[]]>;

export interface ShaderSetup<P extends ProgramTable> {
  /** the mode, for the overlay */
  mode: string;
  /** file name ('./x.glsl') → its text: the mode's `import.meta.glob('./*.{glsl,vert,frag}', { eager, query: '?raw' })` */
  files: Record<string, string>;
  /** lines ahead of every stage: `#version`, the mode's #defines */
  head: readonly string[];
  programs: P;
  /** the mode's shaders/index.ts' import.meta.hot and import.meta.url: its reloads, where its files are. Only `data`
   * is used, which Vite keeps across the module's reloads (typed loosely: bun's types declare import.meta.hot too) */
  hot: { data: { live?: Map<GL, Live>; failed?: boolean } } | undefined;
  url: string;
}

export interface Shaders<P extends ProgramTable> {
  /** every program's stages, put together */
  sources(): Record<keyof P & string, { vs: Source; fs: Source }>;
  /** every program, compiled for gl; in dev `onSwap` runs after a saved shader file relinked some */
  programs(gl: GL, onSwap?: () => void): Promise<Record<keyof P & string, Program>>;
}

interface Live {
  ps: Record<string, Program>;
  /** what each program was last linked from */
  linked: Record<string, string>;
  onSwap?: () => void;
}

/**
 * A mode's shader library. Called again when the mode's shaders/index.ts reloads (a saved shader file): it then
 * relinks the programs already made from the files as saved now, or reloads the page if the first build failed.
 */
export function shaders<P extends ProgramTable>(s: ShaderSetup<P>): Shaders<P> {
  const names = Object.keys(s.programs) as (keyof P & string)[];
  const hot = s.hot;
  /** dev: the programs made so far, per context; kept across the module's reloads */
  const live: Map<GL, Live> | undefined = hot ? (hot.data.live ??= new Map()) : undefined;

  /** a stage: its file with every #include put in place */
  const stage = (entry: string, defines: readonly string[]): Source => {
    const files = ['(head)'];
    const out = [...s.head, ...defines.map((d) => `#define ${d}`)];
    const put = (name: string, from: ShaderAt | null) => {
      if (files.includes(name)) return;
      const text = s.files['./' + name];
      if (text === undefined) throw new ShaderError('', `#include "${name}": no such file in shaders/`, from ? [from] : []);
      const n = files.push(name) - 1;
      out.push(`#line 1 ${n}`);
      text.split('\n').forEach((line, i) => {
        const inc = /^\s*#include\s+"(.+)"/.exec(line);
        if (!inc) return void out.push(line);
        put(inc[1]!, { file: name, line: i + 1, text: line });
        out.push(`#line ${i + 2} ${n}`);
      });
    };
    put(entry, null);
    return { text: out.join('\n'), files };
  };

  const sources = () => {
    const out = {} as Record<keyof P & string, { vs: Source; fs: Source }>;
    for (const k of names) {
      const [vs, fs, ...defines] = s.programs[k]!;
      out[k] = { vs: stage(vs, defines), fs: stage(fs, defines) };
    }
    return out;
  };

  const programs = async (gl: GL, onSwap?: () => void) => {
    try {
      const src = sources();
      const ps = {} as Record<keyof P & string, Program>;
      const linked: Record<string, string> = {};
      for (const k of names) {
        ps[k] = new Program(gl, k, src[k].vs, src[k].fs);
        linked[k] = src[k].vs.text + src[k].fs.text;
      }
      const ext = gl.getExtension('KHR_parallel_shader_compile');
      if (ext) while (!names.every((k) => ps[k].done(ext.COMPLETION_STATUS_KHR))) await new Promise((res) => setTimeout(res, 4));
      for (const k of names) ps[k].link();
      live?.set(gl, { ps, linked, onSwap });
      return ps;
    } catch (e) {
      if (hot) {
        hot.data.failed = true;
        report([e]);
      }
      throw e;
    }
  };

  /** dev: relink every program whose stages changed */
  const swap = () => {
    let src;
    try {
      src = sources();
    } catch (e) {
      return report([e]);
    }
    const errors: unknown[] = [];
    for (const [gl, l] of live!) {
      let changed = false;
      for (const k of names) {
        const text = src[k].vs.text + src[k].fs.text;
        if (text === l.linked[k]) continue;
        try {
          l.ps[k]!.relink(src[k].vs, src[k].fs);
          l.linked[k] = text;
          changed = true;
        } catch (e) {
          errors.push(e);
        }
      }
      if (changed && !gl.isContextLost()) l.onSwap?.();
    }
    report(errors);
  };

  /** dev: errors in Vite's overlay, with the lines of the file the first points at. A mistake in a shared piece fails
   * every program that includes it: each log shows once, with the programs it failed */
  const report = (errors: unknown[]) => {
    for (const e of errors) console.error(e);
    const Overlay = customElements.get('vite-error-overlay');
    if (!Overlay || !errors.length) return;
    const by = new Map<string, string[]>();
    for (const e of errors) {
      const [log, name] = e instanceof ShaderError ? [e.log, e.program] : [e instanceof Error ? e.message : String(e), ''];
      by.set(log, [...(by.get(log) ?? []), name]);
    }
    const message = [...by].map(([log, names]) => log + (names[0] ? `\n  in ${names.join(', ')}` : '')).join('\n\n');
    const at = errors.find((e): e is ShaderError => e instanceof ShaderError && e.at.length > 0)?.at[0];
    const lines = at ? (s.files['./' + at.file] ?? '').split('\n') : [];
    const from = at ? Math.max(1, at.line - 3) : 0;
    const frame = lines
      .slice(from - 1, at ? at.line + 2 : 0)
      .map((l, i) => `${from + i === at!.line ? '>' : ' '}${String(from + i).padStart(4)} | ${l}`)
      .join('\n');
    const loc = at && { file: new URL('./' + at.file, s.url).pathname, line: at.line, column: 1 };
    document.body.append(new Overlay({ message, stack: '', frame, loc, plugin: `${s.mode} shaders` }, false));
  };

  // the first build failed, so nothing runs to relink: start the page over with the files as saved now
  if (hot?.data.failed) location.reload();
  else if (live?.size) swap();
  return { sources, programs };
}
