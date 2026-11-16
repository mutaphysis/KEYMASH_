// The forest floor: the moss-and-soil strip bent along the curve, its soil giving way to the hex-tiled horizons.
// The hand-over is a height blend (luminance as height): toward the bottom of the strip its pebbles and crumbs
// still stand out of the soil below and its dark gaps fill with soil first, along a line that wanders.

in vec2 vWorld;
in vec2 vUV;
in float vDepth;

uniform vec3 uFade; // v where the strip starts giving way, where it is gone, how far the line wanders (in v)
uniform vec3 uTint; // the key light

out vec4 o;

void main() {
  vec4 s = strip(vUV);
  vec3 g = soil(vWorld, vDepth);
  float wander = (fbm(vec2(vWorld.x / 60.0, 1.7) + uDrift) - 0.5) * uFade.z;
  float t = smoothstep(uFade.x, uFade.y, vUV.y + wander);
  // the soil half of the strip is opaque, but where it has holes the soil shows through; the moss doesn't
  float under = smoothstep(0.4, 0.55, vUV.y);
  float k = under * heightMix(luma(s.rgb / max(s.a, 1e-4)), luma(g), t, 0.14);
  vec4 c = s + (1.0 - s.a) * under * vec4(g, 1.0);
  c = mix(c, vec4(g, 1.0), k);
  o = vec4(c.rgb * uTint, c.a);
}
