// COOKIE_'s shaders, one GLSL piece per file, put together by src/engine/shaders.ts (#include, #line, parallel
// compile, hot relink in dev). The scene is raymarched in one draw; crumbs and motes are instanced billboards drawn
// into the same target against its depth; blit stretches the target over the canvas.
import { FIELD_EXT, FIELD_N } from '../shapes';
import { shaders } from '../../../engine/shaders';
import type { ProgramTable } from '../../../engine/shaders';
import type { Program } from '../../../engine/gl';

/** ahead of every stage: the field atlas' extent and texels per side (shapes.ts) */
const HEAD = ['#version 300 es', `#define FIELD_EXT ${FIELD_EXT.toFixed(4)}`, `#define FIELD_N ${FIELD_N.toFixed(1)}`];

/** each program: its vertex stage, its fragment stage */
const PROGRAMS = {
  scene: ['full.vert', 'scene.frag'],
  crumb: ['crumb.vert', 'crumb.frag'],
  mote: ['mote.vert', 'mote.frag'],
  blit: ['full.vert', 'blit.frag'],
} satisfies ProgramTable;

export type Programs = Record<keyof typeof PROGRAMS, Program>;

export const { programs } = shaders({
  mode: 'cookie',
  files: import.meta.glob<string>('./*.{glsl,vert,frag}', { eager: true, query: '?raw', import: 'default' }),
  head: HEAD,
  programs: PROGRAMS,
  hot: import.meta.hot,
  url: import.meta.url,
});

// literally import.meta.hot.accept: that is how Vite tells a module takes its own updates
if (import.meta.hot) import.meta.hot.accept();
