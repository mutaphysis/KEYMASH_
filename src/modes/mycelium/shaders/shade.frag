// Bakes one layer of the canopy's shade map (shademap.glsl) over the whole world: the column shade under the pieces
// uCast.x … uCast.y - 1 but uCast.z (-1: none left out) at uCrownShadow's strength, and the occlusion by the pieces
// from uFirst on (crown.glsl; uPieceCount: none).

#include "crown.glsl"

in vec2 vWorld;

uniform ivec3 uCast;
uniform int uFirst;

out vec4 o;

void main() {
  o = vec4(crownShade(vWorld, uCast.x, uCast.y, uCast.z), crownOcclusion(vWorld, uFirst), 0.0, 1.0);
}
