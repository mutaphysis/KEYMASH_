// The mossy hill behind the floor: the moss band of a second ground strip (its silhouette against the sky), handing
// over to a hex-tiled moss carpet for the hill's body, in a height blend along a wandering line like the floor's
// strip into its soil. A little darker for being further back, and darker still toward its foot.

#include "noise.glsl"
#include "blend.glsl"
#include "strip.glsl"
#include "mossfill.glsl"
#include "shademap.glsl"

in vec2 vWorld;
in vec2 vUV;

uniform float uMossEnd; // v in the strip picture where its moss ends
uniform float uShade;   // darker than the floor in front
uniform vec3 uTint;     // the key light

out vec4 o;

void main() {
  // below the band the strip is read at its last moss row: weight 0 there, but the derivatives stay continuous
  vec4 s = strip(vec2(vUV.x, min(vUV.y, 1.0) * uMossEnd));
  vec3 f = mossFill(vWorld);
  float wander = (fbm(vec2(vWorld.x / 55.0, 3.1)) - 0.5) * 0.5;
  float t = max(smoothstep(0.45, 0.9, vUV.y + wander), step(1.0, vUV.y));
  // the band's top is its silhouette against the sky; only lower down does the carpet show through its gaps
  float under = smoothstep(0.25, 0.5, vUV.y);
  float k = under * heightMix(luma(s.rgb / max(s.a, 1e-4)), luma(f), t, 0.14);
  vec4 c = s + (1.0 - s.a) * under * vec4(f, 1.0);
  c = mix(c, vec4(f, 1.0), k);
  // the foot of the hill lies in the floor's shade, the hill under the crown in the crown's
  float foot = 1.0 - 0.35 * smoothstep(1.0, 3.0, vUV.y);
  o = vec4(c.rgb * uTint * uShade * foot * shadeAt(vWorld, 0.0).r, c.a);
}
