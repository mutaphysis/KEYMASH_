// A tree: its picture on a grid of columns whose foot rows follow the floor under them (the trunk stays upright, only
// the foot bends), reaching a little past the picture on every side but the top for its contact shade.

layout(location = 0) in vec2 aPos; // world
layout(location = 1) in vec2 aUV;  // in the tree's picture (outside 0 … 1: past it)

out vec2 vWorld;
out vec2 vUV;

void main() {
  vWorld = aPos;
  vUV = aUV;
  gl_Position = toClip(aPos);
}
