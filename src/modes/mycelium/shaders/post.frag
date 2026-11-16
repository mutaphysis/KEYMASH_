// The picture, finished: a gentle contrast curve, a vignette, and fine film grain (it also hides banding in the
// smooth air). The scene was drawn into a target sized by the pixel budget; this stretches it over the canvas.

in vec2 vScreen;

uniform sampler2D uScene;
uniform vec2 uAspect;  // screen width / height, 1
uniform float uSeed;   // the grain's pattern: new every frame, fixed when motion is reduced

out vec4 o;

void main() {
  vec3 c = texture(uScene, vScreen).rgb;
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.2);
  float v = length((vScreen - 0.5) * uAspect);
  c *= 1.0 - 0.6 * smoothstep(0.4, 1.15, v);
  c += (hash12(gl_FragCoord.xy + uSeed) - 0.5) * 0.03;
  o = vec4(c, 1.0);
}
