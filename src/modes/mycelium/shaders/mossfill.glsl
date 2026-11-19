// The body of a mossy hill: the library's four moss carpets (one texture array), hex-tiled like the soil so no
// repeat shows. Which carpet a patch shows follows slow noise, so star moss, lichen, shade moss and clover come in
// clusters of a few patches rather than a checkerboard. Offsets and left-right mirroring only: lit from above.

#include "noise.glsl"
#include "hex.glsl"

uniform highp sampler2DArray uMossFill;
uniform float uMossTile; // view units one texture repeat covers (the strip's texel scale)
uniform vec3 uMossGain;  // matches the carpets' colour to the moss band of the hill's strip

vec3 mossTap(vec2 uv, vec2 v, vec2 dx, vec2 dy) {
  vec2 st = hexVertex(v) / HEX_K * uMossTile;
  float layer = floor(clamp(vnoise(st / 140.0 + 11.0) * 1.6 - 0.3, 0.0, 0.999) * 4.0);
  vec2 h = hash22(v + 37.0);
  vec2 u = uv + h;
  if (fract(h.x * 13.7) > 0.5) u.x = -u.x;
  return textureGrad(uMossFill, vec3(u, layer), dx, dy).rgb;
}

/** the moss carpet at a world point */
vec3 mossFill(vec2 world) {
  vec2 uv = vec2(world.x, -world.y) / uMossTile;
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  vec3 w;
  vec2 v1, v2, v3;
  hexGrid(uv * HEX_K, w, v1, v2, v3);
  vec3 c = hexBlend(mossTap(uv, v1, dx, dy), mossTap(uv, v2, dx, dy), mossTap(uv, v3, dx, dy), w, 0.6);
  return c * uMossGain;
}
