// Motes: flour and dust in the air over the tray, one instance each, placed and moved entirely here
// from their index and the time. A slow draft carries them across, each dances on its own, and they
// light up in the beam from the soft box above. Added onto the scene, behind the cookies where they are.

layout(location = 0) in vec2 aCorner;
uniform mat4 uViewProj;
uniform vec3 uCamRight, uCamUp;
uniform float uTime, uSpot;
out vec2 vUv;
out float vGlow;
#include "tone.glsl"
float h(float n) { return fract(sin(n * 127.1 + 31.7) * 43758.5453); }
void main() {
  float id = float(gl_InstanceID);
  float t = uTime;
  float W = uSpot * 1.3, H = 3.2;
  vec3 p = vec3((h(id) * 2. - 1.) * W, h(id + .37) * H, (h(id + .71) * 2. - 1.) * W);
  // the draft: sideways, a little up or down, round and round the box
  p.x = mod(p.x + W + t * (.05 + .06 * h(id + 2.)), 2. * W) - W;
  p.y = mod(p.y + t * .03 * (h(id + 3.) - .35), H);
  // the dance
  p += .2 * vec3(sin(t * (.3 + .4 * h(id + 4.)) + id), .6 * sin(t * (.25 + .3 * h(id + 5.)) + id * 1.3), cos(t * (.35 + .3 * h(id + 6.)) + id * .7));
  p.y += .2;
  // bright in the beam, a slow twinkle as they turn, gone at the edges of the box (no popping when they wrap)
  float beam = length(cross(p, KEY_DIR));
  vGlow = smoothstep(uSpot, uSpot * .15, beam) * (.55 + .45 * sin(t * (.8 + 1.6 * h(id + 7.)) + id * 3.))
    * smoothstep(W, W * .8, abs(p.x)) * smoothstep(H + .2, H - .3, p.y) * smoothstep(.1, .4, p.y);
  float r = .008 + .012 * h(id + 8.);
  vUv = aCorner;
  gl_Position = uViewProj * vec4(p + (uCamRight * aCorner.x + uCamUp * aCorner.y) * r * 2., 1.);
}
