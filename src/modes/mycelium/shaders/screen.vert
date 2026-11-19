// One triangle over the whole screen, no buffers: vScreen 0 … 1, vWorld where the camera looks.

#include "camera.glsl"

out vec2 vScreen;
out vec2 vWorld;

void main() {
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  vScreen = p * 0.5 + 0.5;
  vWorld = uCam.xy + p * uCam.zw;
  gl_Position = vec4(p, 0.0, 1.0);
}
