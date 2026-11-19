// The crown's leaves: the leaf fill hex-tiled like the moss carpets (offsets and left-right mirroring), and every
// leaf recoloured by its tree's season in its kind's colours. The photographs' own greens vary from picture to picture
// and leaf to leaf; only their brightness is kept (the shading, veins, leaves in front of leaves) and mapped onto the
// season's colours, so strip and fill match and a crown turns together. Each kind turns its own way: birch to gold,
// oak to russet, beech to copper, maple to red; the season itself is each tree's (crown.ts: treeSeason). Patches the
// size of a spray of leaves drift a little ahead of or behind it, more in autumn. Twigs (not green in the photograph)
// stay their own colour, greyed.

#include "noise.glsl"
#include "hex.glsl"

uniform sampler2D uLeafFill;
uniform float uLeafTile; // view units one fill repeat covers
uniform vec3 uLeafGain;  // matches the fill's colour to the canopy strip's dense top
uniform float uLeafLuma; // the canopy strip's mean brightness: what maps onto a season's middle colour
uniform float uSeason;   // its tree's: 0 summer, 1 turning, 2 the peak of autumn, 3 the dry leaves of winter
uniform int uLeafKind;   // trees.ts: LEAVES

vec3 leafTap(vec2 uv, vec2 v, vec2 dx, vec2 dy) {
  vec2 h = hash22(v + 53.0);
  vec2 u = uv + h;
  if (fract(h.x * 13.7) > 0.5) u.x = -u.x;
  return textureGrad(uLeafFill, u, dx, dy).rgb;
}

/** the leaf fill at a world point (opaque, straight colour) */
vec3 leafFill(vec2 world) {
  vec2 uv = vec2(world.x, -world.y) / uLeafTile;
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  vec3 w;
  vec2 v1, v2, v3;
  hexGrid(uv * HEX_K, w, v1, v2, v3);
  vec3 c = hexBlend(leafTap(uv, v1, dx, dy), leafTap(uv, v2, dx, dy), leafTap(uv, v3, dx, dy), w, 0.6);
  return c * uLeafGain;
}

// per kind of leaves, per season: in deep shade, the middle, in full light (straight sRGB)
const vec3 SEASON[48] = vec3[48](
  // birch: a yellowish green, turning yellow, then gold; winter's leaves a pale ochre
  vec3(0.04, 0.07, 0.02), vec3(0.25, 0.38, 0.13), vec3(0.62, 0.76, 0.36),
  vec3(0.08, 0.08, 0.02), vec3(0.47, 0.46, 0.10), vec3(0.90, 0.87, 0.38),
  vec3(0.11, 0.08, 0.01), vec3(0.62, 0.47, 0.06), vec3(1.00, 0.86, 0.34),
  vec3(0.07, 0.05, 0.02), vec3(0.44, 0.33, 0.15), vec3(0.78, 0.65, 0.42),
  // oak: dark green, turning olive, then russet brown; winter's leaves brown
  vec3(0.02, 0.05, 0.02), vec3(0.16, 0.29, 0.10), vec3(0.46, 0.62, 0.28),
  vec3(0.05, 0.06, 0.02), vec3(0.34, 0.35, 0.11), vec3(0.72, 0.70, 0.32),
  vec3(0.08, 0.04, 0.01), vec3(0.44, 0.25, 0.08), vec3(0.82, 0.55, 0.26),
  vec3(0.06, 0.035, 0.02), vec3(0.35, 0.23, 0.12), vec3(0.66, 0.49, 0.31),
  // beech: fresh green, turning yellow-orange, then copper; winter's leaves the copper-tan it keeps
  vec3(0.03, 0.06, 0.02), vec3(0.22, 0.36, 0.11), vec3(0.58, 0.74, 0.32),
  vec3(0.09, 0.07, 0.01), vec3(0.56, 0.43, 0.09), vec3(0.95, 0.80, 0.32),
  vec3(0.11, 0.04, 0.01), vec3(0.62, 0.28, 0.06), vec3(0.98, 0.60, 0.25),
  vec3(0.07, 0.04, 0.02), vec3(0.46, 0.27, 0.13), vec3(0.80, 0.56, 0.34),
  // maple: green, turning orange, then red; winter's leaves a reddish brown
  vec3(0.03, 0.06, 0.02), vec3(0.20, 0.35, 0.12), vec3(0.55, 0.72, 0.34),
  vec3(0.11, 0.05, 0.01), vec3(0.66, 0.37, 0.06), vec3(1.00, 0.68, 0.26),
  vec3(0.11, 0.02, 0.01), vec3(0.52, 0.12, 0.05), vec3(0.90, 0.36, 0.20),
  vec3(0.07, 0.035, 0.02), vec3(0.38, 0.20, 0.12), vec3(0.70, 0.46, 0.32)
);

/** season s's colour in this kind of leaves at brightness l (0 shade, 0.5 the middle, 1 full light) */
vec3 seasonColor(float s, float l) {
  int a = int(floor(clamp(s, 0.0, 2.999)));
  float f = clamp(s - float(a), 0.0, 1.0);
  int k = uLeafKind * 12 + a * 3;
  vec3 lo = mix(SEASON[k], SEASON[k + 3], f);
  vec3 mid = mix(SEASON[k + 1], SEASON[k + 4], f);
  vec3 hi = mix(SEASON[k + 2], SEASON[k + 5], f);
  return l < 0.5 ? mix(lo, mid, l * 2.0) : mix(mid, hi, (l - 0.5) * 2.0);
}

/** a leaf texel (straight colour) at a world point, in the season's colours */
vec3 leafColor(vec3 c, vec2 world) {
  float l = luma(c);
  // green in the photograph is leaf; dark is leaf too (shade between leaves, whatever its hue)
  float leaf = max(smoothstep(0.0, 0.04, c.g - max(c.r, c.b)), 1.0 - smoothstep(0.06, 0.16, l));
  float autumn = smoothstep(0.3, 1.0, uSeason) * (1.0 - smoothstep(2.2, 2.9, uSeason));
  float spread = mix(0.1, 0.4, autumn);
  float s = uSeason + (fbm(world / 45.0 + 13.0) - 0.5) * 2.0 * spread;
  vec3 tinted = seasonColor(clamp(s, 0.0, 3.0), clamp(0.5 * l / uLeafLuma, 0.0, 1.0));
  vec3 twig = mix(vec3(l), c, 0.5);
  return mix(twig, tinted, leaf);
}
