// The crown's canopy pieces: per piece a ribbon along its U-shaped outline (three vertices per column: the canopy
// strip's dense top inside the outline, where the piece stops being opaque, the tips of its hanging leaves outside),
// and a fan from high above the world to the ribbon's inner edge for its body.

#include "camera.glsl"

layout(location = 0) in vec2 aPos;    // world
layout(location = 1) in vec2 aUV;     // u along the outline in strip widths, v down the strip (below 0: the body)
layout(location = 2) in float aPiece; // which piece, back to front

out vec2 vWorld;
out vec2 vUV;
flat out int vPiece;

void main() {
  vWorld = aPos;
  vUV = aUV;
  vPiece = int(aPiece + 0.5);
  gl_Position = toClip(aPos);
}
