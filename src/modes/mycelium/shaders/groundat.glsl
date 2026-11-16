// The forest floor at any world point, for things standing in it: the ground mesh's columns as a float texture (per
// column the curve's y, u along the curve, the strip's height there, where its moss ends), read between columns.
// groundAt gives the strip's texel at a point the way ground.frag shows it there (straight down from the strip's top,
// where the mesh goes along the curve's normal: the same within a few units where the floor is gentle).
// Needs strip.glsl.

uniform highp sampler2D uGroundAt; // RGBA32F, one texel per mesh column
uniform vec2 uGroundCols;          // the first column's x, the columns' spacing
uniform float uLift;               // the strip's top above the curve (view units)
uniform float uMossV;              // v where the moss ends in the strip picture

vec4 groundColumn(float x) {
  float f = (x - uGroundCols.x) / uGroundCols.y;
  int n = textureSize(uGroundAt, 0).x;
  int i = clamp(int(floor(f)), 0, n - 2);
  return mix(texelFetch(uGroundAt, ivec2(i, 0), 0), texelFetch(uGroundAt, ivec2(i + 1, 0), 0), clamp(f - float(i), 0.0, 1.0));
}

/** the forest floor's y under x */
float floorAt(float x) {
  return groundColumn(x).x;
}

/** the ground strip's texel at world point p (premultiplied; transparent above its tufts) */
vec4 groundAt(vec2 p) {
  vec4 c = groundColumn(p.x);
  float v = clamp((c.x + uLift - p.y) / c.z, 0.0, 1.0);
  v = v < c.w ? v / c.w * uMossV : uMossV + (v - c.w) / (1.0 - c.w) * (1.0 - uMossV);
  return strip(vec2(c.y, v));
}
