// The soil: four horizons of the library's soil textures (one texture array), hex-tiled so no repeat shows.
// Down from the ground strip: leafy humus, dark humus, plain, stony. Each hex vertex picks its horizon by its own
// depth, moved by slow noise, so borders wander and interlock patch by patch instead of running as lines.
// No rotation, offsets and left-right mirroring only: the soil is lit from above.

uniform highp sampler2DArray uSoil;
uniform float uSoilTile; // view units one texture repeat covers (the strip's texel scale)
uniform vec3 uBands;     // depths where leafy turns dark, dark plain, plain stony
uniform vec2 uDrift;     // where the wandering noise is read: each program its own
uniform vec3 uSoilGain;  // matches the soil's colour to the strip it meets
uniform vec3 uDeep;      // what the soil darkens toward, deep down

const float PATCH = 1.0;

float horizon(float d) {
  return d < uBands.x ? 3.0 : d < uBands.y ? 2.0 : d < uBands.z ? 0.0 : 1.0;
}

vec3 soilTap(vec2 uv, vec2 world, float depth, vec2 v, vec2 dx, vec2 dy) {
  // the vertex's place in the world (uv runs down as y runs up), and its depth: the pixel's, moved by how far
  // the vertex lies above or below it, plus wander
  vec2 st = hexVertex(v) * PATCH / HEX_K * uSoilTile;
  vec2 vw = vec2(st.x, -st.y);
  float d = depth + world.y - vw.y + (fbm(vw / 260.0 + uDrift) - 0.5) * 90.0 + (hash12(v + 91.0) - 0.5) * 24.0;
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
