// Crumbs: a lumpy lit ball each, or its blob shadow (uShadow).

precision highp float;
in vec2 vUv;
in vec3 vColor;
in float vSeed, vLift;
uniform vec3 uCamRight, uCamUp, uCamFwd;
uniform float uShadow, uHeat;
out vec4 fragColor;
#include "tone.glsl"
void main() {
  if (uShadow > .5) {
    float a = .45 * exp(-3. * vLift) * smoothstep(1., .2, length(vUv));
    fragColor = vec4(vec3(1. - a), 1.);
    return;
  }
  vec2 uv = vUv * 1.3;
  float th = atan(uv.y, uv.x);
  float rad = 1. + .16 * sin(th * 3. + vSeed) + .1 * sin(th * 5. + vSeed * 2.3);
  float l = length(uv) / rad;
  if (l > 1.) discard;
  vec3 n = normalize(uCamRight * uv.x + uCamUp * uv.y - uCamFwd * sqrt(1. - l * l) * rad);
  n = normalize(n + .25 * vec3(sin(vSeed + uv.x * 9.), sin(vSeed * 1.7 + uv.y * 8.), 0.));
  vec3 col = vColor * (max(dot(n, KEY_DIR) * .7 + .3, 0.) * keyLight(uHeat) + skyLight(n.y, uHeat));
  fragColor = vec4(display(col), 1.);
}
