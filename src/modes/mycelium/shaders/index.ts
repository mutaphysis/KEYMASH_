// MYCELIUM_'s shaders, put together from the pieces in this folder: shared libraries (noise, camera, height blend,
// hex tiling, soil, strip) first, then the stage's own main(). Each .glsl file states what it needs above it.
import noise from './noise.glsl?raw';
import camera from './camera.glsl?raw';
import blend from './blend.glsl?raw';
import hex from './hex.glsl?raw';
import soil from './soil.glsl?raw';
import strip from './strip.glsl?raw';
import groundVert from './ground.vert?raw';
import groundFrag from './ground.frag?raw';
import ridgeVert from './ridge.vert?raw';
import ridgeFrag from './ridge.frag?raw';
import screenVert from './screen.vert?raw';
import skyFrag from './sky.frag?raw';
import postFrag from './post.frag?raw';
import wireVert from './wire.vert?raw';
import wireFrag from './wire.frag?raw';

const HEAD = '#version 300 es\nprecision highp float;\nprecision highp int;\n';
const glsl = (...parts: string[]) => HEAD + parts.join('\n');

export const GROUND_VS = glsl(camera, groundVert);
export const GROUND_FS = glsl(noise, blend, hex, soil, strip, groundFrag);
export const RIDGE_VS = glsl(camera, ridgeVert);
export const RIDGE_FS = glsl(noise, blend, strip, ridgeFrag);
export const SCREEN_VS = glsl(camera, screenVert);
export const SKY_FS = glsl(noise, skyFrag);
export const POST_FS = glsl(noise, postFrag);
// debug: mesh edges (WIRE_VS) and the full-screen triangle's edges (SCREEN_VS), flat colour
export const WIRE_VS = glsl(camera, wireVert);
export const WIRE_FS = glsl(wireFrag);
