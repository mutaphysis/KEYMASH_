// The ground ribbon: three rows of vertices per column (the top of the strip on the curve, the strip's bottom
// along the curve's normal, the bottom of the world straight below).

layout(location = 0) in vec2 aPos;   // world
layout(location = 1) in vec2 aUV;    // u along the curve in strip repeats, v down the strip (beyond 1: below it)
layout(location = 2) in float aDepth; // view units below the forest floor

out vec2 vWorld;
out vec2 vUV;
out float vDepth;

void main() {
  vWorld = aPos;
  vUV = aUV;
  vDepth = aDepth;
  gl_Position = toClip(aPos);
}
