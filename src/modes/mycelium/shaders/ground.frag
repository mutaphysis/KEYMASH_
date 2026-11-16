// The forest floor: the moss-and-soil strip bent along the curve, its soil giving way to the hex-tiled horizons.
// The hand-over is a height blend (luminance as height): toward the bottom of the strip its pebbles and crumbs
// still stand out of the soil below and its dark gaps fill with soil first, along a line that rises and dips over
// long stretches and frays into blotches up close, so the strip's gravel never ends along a ruled line.

in vec2 vWorld;
in vec2 vUV;
in float vDepth;

uniform vec3 uFade; // v where the strip starts giving way, where it is gone, how far the line rises and dips (in v)
uniform vec3 uTint; // the key light

out vec4 o;

void main() {
  vec4 s = strip(vUV);
  vec3 g = soil(vWorld, vDepth);
  float wander = (fbm(vec2(vWorld.x / 420.0, 1.7) + uDrift) - 0.5) * uFade.z;
  wander += (fbm(vWorld / vec2(70.0, 35.0) + uDrift + 5.0) - 0.5) * 0.45;
  // past the strip's bottom row only soil, however far the line wandered
  float t = max(smoothstep(uFade.x, uFade.y, vUV.y + wander), smoothstep(0.96, 1.0, vUV.y));
  // the soil half of the strip is opaque, but where it has holes the soil shows through; the moss doesn't, and the
  // wandering line never reaches up into it
  float under = smoothstep(0.5, 0.62, vUV.y);
  float k = under * heightMix(luma(s.rgb / max(s.a, 1e-4)), luma(g), t, 0.14);
  vec4 c = s + (1.0 - s.a) * under * vec4(g, 1.0);
  c = mix(c, vec4(g, 1.0), k);
  o = vec4(c.rgb * uTint, c.a);
}
