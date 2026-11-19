// The soil: four horizons of the library's soil textures (one texture array), hex-tiled so no repeat shows.
// Down from the ground strip: leafy humus, dark humus, plain, stony. Each hex vertex picks its horizon by its own
// depth, bent by noise at two scales (broad swells, narrower tongues), so borders rise and dip instead of running
// along the floor, and interlock patch by patch. Here and there a pocket holds a horizon from above or below:
// gravel in the humus, humus washed down into the gravel.
// No rotation, offsets and left-right mirroring only: the soil is lit from above.

#include "noise.glsl"
#include "hex.glsl"

uniform highp sampler2DArray uSoil;
uniform float uSoilTile; // view units one texture repeat covers (the strip's texel scale)
uniform vec3 uBands;     // depths where leafy turns dark, dark plain, plain stony
uniform vec2 uDrift;     // where the wandering noise is read: each program its own
uniform vec3 uSoilGain;  // matches the soil's colour to the strip it meets
uniform vec3 uDeep;      // what the soil darkens toward, deep down

const float PATCH = 1.0;
const float SWELL = 240.0;  // how far a border rises and dips over broad stretches (view units, peak to peak)
const float TONGUE = 110.0; // and in narrower tongues
const float POCKETS = 0.74; // pocket noise above this: a lens of another horizon (higher: fewer)
const float LENS = 190.0;   // how far up or down a pocket reaches for its horizon

float horizon(float d) {
  return d < uBands.x ? 3.0 : d < uBands.y ? 2.0 : d < uBands.z ? 0.0 : 1.0;
}

vec3 soilTap(vec2 uv, vec2 world, float depth, vec2 v, vec2 dx, vec2 dy) {
  // the vertex's place in the world (uv runs down as y runs up), and its depth: the pixel's, moved by how far
  // the vertex lies above or below it, then bent
  vec2 st = hexVertex(v) * PATCH / HEX_K * uSoilTile;
  vec2 vw = vec2(st.x, -st.y);
  float d = depth + world.y - vw.y;
  d += (fbm(vw / vec2(620.0, 380.0) + uDrift) - 0.5) * SWELL;
  d += (fbm(vw / vec2(150.0, 110.0) + uDrift + 17.0) - 0.5) * TONGUE;
  d += (hash12(v + 91.0) - 0.5) * 40.0;
  // pockets: blobs a few patches across, reaching up or down by their own sign
  vec2 pw = vw / 170.0 + uDrift * 1.3 + 40.0;
  if (vnoise(pw) > POCKETS) d += (vnoise(pw * 0.37 + 9.0) < 0.5 ? -LENS : LENS);
  vec2 h = hash22(v);
  vec2 u = uv + h;
  if (fract(h.x * 13.7) > 0.5) u.x = -u.x;
  // derivatives of the plain uv: the offsets jump at patch borders, texture() would drop to the smallest mip there
  return textureGrad(uSoil, vec3(u, horizon(d)), dx, dy).rgb;
}

/** the soil at a world point, `depth` view units below the forest floor */
vec3 soil(vec2 world, float depth) {
  vec2 uv = vec2(world.x, -world.y) / uSoilTile;
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  vec3 w;
  vec2 v1, v2, v3;
  hexGrid(uv * HEX_K / PATCH, w, v1, v2, v3);
  vec3 c = hexBlend(
    soilTap(uv, world, depth, v1, dx, dy),
    soilTap(uv, world, depth, v2, dx, dy),
    soilTap(uv, world, depth, v3, dx, dy),
    w, 0.6);
  // a slow tone over several repeats: damp patches lighter and warmer, dry ones darker
  c *= 1.0 + 0.45 * (fbm(world / 380.0 + uDrift + 4.0) - 0.5) * vec3(1.15, 1.0, 0.8);
  c *= uSoilGain;
  return mix(c, uDeep, 0.6 * smoothstep(150.0, 900.0, depth));
}
