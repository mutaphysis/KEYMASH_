// Motes: a small warm glow each, added onto the scene.

precision highp float;
in vec2 vUv;
in float vGlow;
uniform float uHeat;
out vec4 fragColor;
void main() {
  float d = dot(vUv, vUv);
  if (d > 1.) discard;
  // warm white in daylight, embers by the oven; a small bright core, little halo
  vec3 c = mix(vec3(1., .94, .82), vec3(1., .5, .16), uHeat) * exp(-7. * d) * vGlow * .4;
  fragColor = vec4(c, 1.);
}
