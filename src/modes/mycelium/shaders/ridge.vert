// The mossy hill behind the floor: two rows of vertices per column (the top of its strip on the hill's curve, the
// bottom of its moss along the curve's normal). Only the moss is drawn; the floor in front hides where it ends.

layout(location = 0) in vec2 aPos; // world
layout(location = 1) in vec2 aUV;  // u along the curve in strip repeats, v down the moss band (0 … 1)

out vec2 vUV;

void main() {
  vUV = aUV;
  gl_Position = toClip(aPos);
}
