// MYCELIUM_'s shaders, one GLSL piece per file. A file pulls in the pieces it uses with `#include "x.glsl"`: each piece
// once per stage, where it is first asked for, so a piece includes what it needs itself. PROGRAMS pairs the stages.
// `#line` keeps every file's own numbering, so a compile error names the file and line it came from.
// In dev, saving a shader file relinks the programs it changed in place, without reloading the page; one that doesn't
// compile keeps its old program and shows its error in Vite's overlay.
import { CROWN_OPAQUE, CROWN_PIECES } from '../crown';
import { Program, ShaderError } from '../gl';
import type { GL, ShaderAt, Source } from '../gl';

const FILES = import.meta.glob<string>('./*.{glsl,vert,frag}', { eager: true, query: '?raw', import: 'default' });

/** ahead of every stage: crown.ts's array length, and the share render.ts cuts the canopy's meshes at */
const HEAD = [
  '#version 300 es',
  'precision highp float;',
  'precision highp int;',
  `#define CROWN_PIECES ${CROWN_PIECES}`,
  `#define CROWN_OPAQUE ${CROWN_OPAQUE.toFixed(4)}`,
];

/** each program: its vertex stage, its fragment stage, what else it #defines */
const PROGRAMS = {
  sky: ['screen.vert', 'sky.frag'],
  ridge: ['ridge.vert', 'ridge.frag'],
  ground: ['ground.vert', 'ground.frag'],
  tree: ['tree.vert', 'tree.frag'],
  // a canopy piece's body, and its fringe of hanging leaves cut out at their edges
  crown: ['crown.vert', 'crown.frag'],
  crownFringe: ['crown.vert', 'crown.frag', 'CUTOUT'],
  buried: ['buried.vert', 'buried.frag'],
  // bakes a layer of the shade map (full screen over the world)
  shade: ['screen.vert', 'shade.frag'],
  post: ['screen.vert', 'post.frag'],
  // debug: mesh edges, and the full-screen triangle's edges, flat colour
  wire: ['wire.vert', 'wire.frag'],
  wireScreen: ['screen.vert', 'wire.frag'],
} satisfies Record<string, readonly string[]>;

export type ProgramName = keyof typeof PROGRAMS;
export type Programs = Record<ProgramName, Program>;
const NAMES = Object.keys(PROGRAMS) as ProgramName[];

/** a stage: its file with every #include put in place */
function stage(entry: string, defines: readonly string[]): Source {
  const files = ['(head)'];
  const out = [...HEAD, ...defines.map((d) => `#define ${d}`)];
  const put = (name: string, from: ShaderAt | null) => {
    if (files.includes(name)) return;
    const text = FILES['./' + name];
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
}

/** every program's stages, put together (the perf harness names its draws by them) */
export function sources(): Record<ProgramName, { vs: Source; fs: Source }> {
  const out = {} as Record<ProgramName, { vs: Source; fs: Source }>;
  for (const k of NAMES) {
    const [vs, fs, ...defines] = PROGRAMS[k];
    out[k] = { vs: stage(vs!, defines), fs: stage(fs!, defines) };
  }
  return out;
}

interface Live {
  ps: Programs;
  /** what each program was last linked from */
  linked: Record<ProgramName, string>;
  onSwap?: () => void;
}

const hot = import.meta.hot;
/** dev: the programs made so far, per context; kept across this module's reloads */
const live: Map<GL, Live> | undefined = hot ? (hot.data.live ??= new Map()) : undefined;

/** every program, compiled for gl; in dev `onSwap` runs after a saved shader file relinked some */
export function programs(gl: GL, onSwap?: () => void): Programs {
  try {
    const src = sources();
    const ps = {} as Programs;
    const linked = {} as Record<ProgramName, string>;
    for (const k of NAMES) {
      ps[k] = new Program(gl, k, src[k].vs, src[k].fs);
      linked[k] = src[k].vs.text + src[k].fs.text;
    }
    live?.set(gl, { ps, linked, onSwap });
    return ps;
  } catch (e) {
    if (hot) {
      hot.data.failed = true;
      report([e]);
    }
    throw e;
  }
}

/** dev: this module again, with the files as saved now: relink every program whose stages changed */
function swap(): void {
  let src;
  try {
    src = sources();
  } catch (e) {
    return report([e]);
  }
  const errors: unknown[] = [];
  for (const [gl, l] of live!) {
    let changed = false;
    for (const k of NAMES) {
      const text = src[k].vs.text + src[k].fs.text;
      if (text === l.linked[k]) continue;
      try {
        l.ps[k].relink(src[k].vs, src[k].fs);
        l.linked[k] = text;
        changed = true;
      } catch (e) {
        errors.push(e);
      }
    }
    if (changed && !gl.isContextLost()) l.onSwap?.();
  }
  report(errors);
}

/** dev: errors in Vite's overlay, with the lines of the file the first points at. A mistake in a shared piece fails
 * every program that includes it: each log shows once, with the programs it failed */
function report(errors: unknown[]): void {
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
  const lines = at ? (FILES['./' + at.file] ?? '').split('\n') : [];
  const from = at ? Math.max(1, at.line - 3) : 0;
  const frame = lines
    .slice(from - 1, at ? at.line + 2 : 0)
    .map((l, i) => `${from + i === at!.line ? '>' : ' '}${String(from + i).padStart(4)} | ${l}`)
    .join('\n');
  const loc = at && { file: new URL('./' + at.file, import.meta.url).pathname, line: at.line, column: 1 };
  document.body.append(new Overlay({ message, stack: '', frame, loc, plugin: 'mycelium shaders' }, false));
}

// literally import.meta.hot.accept: that is how Vite tells a module takes its own updates
if (import.meta.hot) {
  import.meta.hot.accept();
  // the first build failed, so no forest runs to relink: start the page over with the files as saved now
  if (import.meta.hot.data.failed) location.reload();
  else if (live!.size) swap();
}
