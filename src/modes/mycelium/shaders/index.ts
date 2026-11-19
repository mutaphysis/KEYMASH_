// MYCELIUM_'s shaders, one GLSL piece per file, put together by src/engine/shaders.ts (#include, #line, parallel
// compile, hot relink in dev). PROGRAMS pairs the stages.
import { CROWN_OPAQUE, CROWN_PIECES } from '../crown';
import { shaders } from '../../../engine/shaders';
import type { ProgramTable } from '../../../engine/shaders';
import type { Program } from '../../../engine/gl';

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
} satisfies ProgramTable;

export type Programs = Record<keyof typeof PROGRAMS, Program>;

/** sources(): every program's stages (the perf harness names its draws by them); programs(gl, onSwap) */
export const { sources, programs } = shaders({
  mode: 'mycelium',
  files: import.meta.glob<string>('./*.{glsl,vert,frag}', { eager: true, query: '?raw', import: 'default' }),
  head: HEAD,
  programs: PROGRAMS,
  hot: import.meta.hot,
  url: import.meta.url,
});

// literally import.meta.hot.accept: that is how Vite tells a module takes its own updates
if (import.meta.hot) import.meta.hot.accept();
