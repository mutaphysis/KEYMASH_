// The mossy hill behind the floor: three rows of vertices per column (the top of its strip on the hill's curve, the
// bottom of its moss band along the curve's normal, and straight below that, a little below the floor's top, where
// the floor in front hides the rest). Only moss: the band, then the moss carpet of its body.

#include "camera.glsl"

layout(location = 0) in vec2 aPos; // world
layout(location = 1) in vec2 aUV;  // u along the curve in strip repeats, v down the moss band (beyond 1: the body)

out vec2 vWorld;
out vec2 vUV;

void main() {
  vWorld = aPos;
  vUV = aUV;
  gl_Position = toClip(aPos);
}
