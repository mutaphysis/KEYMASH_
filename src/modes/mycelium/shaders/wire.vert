// Debug wireframe of a mesh: its edges where the camera sees them (gl.LINES over the mesh's own vertex buffer).

layout(location = 0) in vec2 aPos; // world

void main() {
  gl_Position = toClip(aPos);
}
