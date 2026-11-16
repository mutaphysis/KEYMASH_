// Behind everything: the air of the forest, brighter and hazier toward the floor, a soft light from the upper left
// and slow mist. Placeholder depth until the backdrop layers come.

in vec2 vScreen;
in vec2 vWorld;

uniform vec3 uSkyHigh, uSkyLow; // the air high up, and at the floor
uniform vec3 uLight;            // the light's glow
uniform float uTime;
uniform vec2 uAspect;           // screen width / height, 1

out vec4 o;

void main() {
  vec3 c = mix(uSkyLow, uSkyHigh, smoothstep(-60.0, 420.0, vWorld.y));
  float d = length((vScreen - vec2(0.22, 0.95)) * uAspect);
  c += uLight * 0.35 * exp(-d * d * 3.0);
  float mist = fbm(vec2(vWorld.x / 300.0 + uTime * 0.01, vWorld.y / 120.0));
  c *= 0.92 + 0.16 * mist;
  o = vec4(c, 1.0);
}
