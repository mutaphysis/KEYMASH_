// Hex tiling (Mikkelsen, "Practical Real-Time Hex-Tiling", JCGT 2022): every vertex of a triangle grid shows
// the texture at its own offset; a pixel blends the three vertices around it. Research: scripts/forest/README.md,
// step 14. The caller picks what each vertex shows (offset, mirror, layer) and blends with hexBlend.

#include "noise.glsl"

const float HEX_K = 3.4641016; // 2 sqrt 3: a patch is about half a texture repeat across at size 1

/** the grid vertices around st (equilateral triangles of edge 1) and their barycentric weights */
void hexGrid(vec2 st, out vec3 w, out vec2 v1, out vec2 v2, out vec2 v3) {
  vec2 sk = vec2(st.x - 0.57735027 * st.y, 1.15470054 * st.y);
  vec2 b = floor(sk), f = fract(sk);
  float z = 1.0 - f.x - f.y;
  if (z > 0.0) {
    w = vec3(z, f.y, f.x);
    v1 = b;
    v2 = b + vec2(0, 1);
    v3 = b + vec2(1, 0);
  } else {
    w = vec3(-z, 1.0 - f.y, 1.0 - f.x);
    v1 = b + vec2(1, 1);
    v2 = b + vec2(1, 0);
    v3 = b + vec2(0, 1);
  }
}

/** a grid vertex back in st */
vec2 hexVertex(vec2 v) {
  return vec2(v.x + 0.5 * v.y, 0.8660254 * v.y);
}

/**
 * Mikkelsen's luminance-weighted blend: where patches meet the brighter texel wins, so a pebble stays whole
 * instead of turning into three faded ghosts. `contrast` 0 is a plain (sharpened) barycentric blend.
 */
vec3 hexBlend(vec3 c1, vec3 c2, vec3 c3, vec3 w, float contrast) {
  vec3 W = mix(vec3(1.0), vec3(luma(c1), luma(c2), luma(c3)), contrast) * pow(w, vec3(7.0));
  return (W.x * c1 + W.y * c2 + W.z * c3) / (W.x + W.y + W.z);
}
