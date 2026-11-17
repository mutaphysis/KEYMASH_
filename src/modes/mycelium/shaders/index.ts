// MYCELIUM_'s shaders, put together from the pieces in this folder: shared libraries (noise, camera, height blend,
// hex tiling, the air, soil, strip, the floor at a point, the crown's shade, its leaves) first, then the stage's own
// main().
// Each .glsl file states what it needs above it.
import { CROWN_PIECES } from '../crown';
import noise from './noise.glsl?raw';
import camera from './camera.glsl?raw';
import blend from './blend.glsl?raw';
import air from './air.glsl?raw';
import hex from './hex.glsl?raw';
import soil from './soil.glsl?raw';
import strip from './strip.glsl?raw';
import mossfill from './mossfill.glsl?raw';
import groundat from './groundat.glsl?raw';
import crownShade from './crown.glsl?raw';
import leaves from './leaves.glsl?raw';
import groundVert from './ground.vert?raw';
import groundFrag from './ground.frag?raw';
import ridgeVert from './ridge.vert?raw';
import ridgeFrag from './ridge.frag?raw';
import buriedVert from './buried.vert?raw';
import buriedFrag from './buried.frag?raw';
import treeVert from './tree.vert?raw';
import treeFrag from './tree.frag?raw';
import crownVert from './crown.vert?raw';
import crownFrag from './crown.frag?raw';
import screenVert from './screen.vert?raw';
import skyFrag from './sky.frag?raw';
import postFrag from './post.frag?raw';
import wireVert from './wire.vert?raw';
import wireFrag from './wire.frag?raw';

const HEAD = '#version 300 es\nprecision highp float;\nprecision highp int;\n';
const glsl = (...parts: string[]) => HEAD + parts.join('\n');
/** the crown's shade, with the length of its arrays */
const crown = `const int CROWN_PIECES = ${CROWN_PIECES};\n` + crownShade;

export const GROUND_VS = glsl(camera, groundVert);
export const GROUND_FS = glsl(noise, blend, hex, soil, strip, crown, groundFrag);
export const RIDGE_VS = glsl(camera, ridgeVert);
export const RIDGE_FS = glsl(noise, blend, hex, strip, mossfill, crown, ridgeFrag);
export const BURIED_VS = glsl(camera, buriedVert);
export const BURIED_FS = glsl(noise, buriedFrag);
export const TREE_VS = glsl(camera, treeVert);
export const TREE_FS = glsl(noise, blend, hex, air, strip, mossfill, groundat, crown, treeFrag);
export const CROWN_VS = glsl(camera, crownVert);
export const CROWN_FS = glsl(noise, blend, hex, air, strip, crown, leaves, crownFrag);
export const SCREEN_VS = glsl(camera, screenVert);
export const SKY_FS = glsl(noise, air, skyFrag);
export const POST_FS = glsl(noise, postFrag);
// debug: mesh edges (WIRE_VS) and the full-screen triangle's edges (SCREEN_VS), flat colour
export const WIRE_VS = glsl(camera, wireVert);
export const WIRE_FS = glsl(wireFrag);
