// The crown's leaves: the leaf fill hex-tiled like the moss carpets (offsets and left-right mirroring), and every
// leaf recoloured by the season. The photographs' own greens vary from picture to picture and leaf to leaf; only
// their brightness is kept (the shading, veins, leaves in front of leaves) and mapped onto one season's colours, so
// strip and fill match and a whole crown turns together. Patches the size of a spray of leaves drift a little ahead
// of or behind the season: barely in summer, a lot in autumn (green, yellow, orange and red side by side).
// Twigs (not green in the photograph) stay their own colour, greyed.

uniform sampler2D uLeafFill;
uniform float uLeafTile; // view units one fill repeat covers
uniform vec3 uLeafGain;  // matches the fill's colour to the canopy strip's dense top
uniform float uLeafLuma; // the canopy strip's mean brightness: what maps onto a season's middle colour
uniform float uSeason;   // 0 summer, 1 yellow, 2 red and orange, 3 the brown of dry winter leaves

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

// per season: in deep shade, the middle, in full light (straight sRGB)
const vec3 SEASON[12] = vec3[12](
  vec3(0.03, 0.06, 0.02), vec3(0.21, 0.34, 0.12), vec3(0.55, 0.70, 0.33), // summer
  vec3(0.10, 0.08, 0.02), vec3(0.55, 0.44, 0.09), vec3(0.95, 0.85, 0.36), // yellow
  vec3(0.12, 0.03, 0.01), vec3(0.58, 0.19, 0.05), vec3(0.97, 0.52, 0.20), // red and orange
  vec3(0.07, 0.04, 0.02), vec3(0.40, 0.24, 0.12), vec3(0.72, 0.53, 0.33)  // dry brown
);

/** season s's colour at brightness l (0 shade, 0.5 the middle, 1 full light) */
vec3 seasonColor(float s, float l) {
  int a = int(floor(clamp(s, 0.0, 2.999)));
  float f = clamp(s - float(a), 0.0, 1.0);
  vec3 lo = mix(SEASON[a * 3], SEASON[a * 3 + 3], f);
  vec3 mid = mix(SEASON[a * 3 + 1], SEASON[a * 3 + 4], f);
  vec3 hi = mix(SEASON[a * 3 + 2], SEASON[a * 3 + 5], f);
  return l < 0.5 ? mix(lo, mid, l * 2.0) : mix(mid, hi, (l - 0.5) * 2.0);
}

/** a leaf texel (straight colour) at a world point, in the season's colours */
vec3 leafColor(vec3 c, vec2 world) {
  float l = luma(c);
  // green in the photograph is leaf; dark is leaf too (shade between leaves, whatever its hue)
  float leaf = max(smoothstep(0.0, 0.04, c.g - max(c.r, c.b)), 1.0 - smoothstep(0.06, 0.16, l));
  float autumn = smoothstep(0.3, 1.0, uSeason) * (1.0 - smoothstep(2.2, 2.9, uSeason));
  float spread = mix(0.12, 0.9, autumn);
  float s = uSeason + (fbm(world / 45.0 + 13.0) - 0.5) * 2.0 * spread;
  vec3 tinted = seasonColor(clamp(s, 0.0, 3.0), clamp(0.5 * l / uLeafLuma, 0.0, 1.0));
  vec3 twig = mix(vec3(l), c, 0.5);
  return mix(twig, tinted, leaf);
}
