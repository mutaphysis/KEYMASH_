// The canopy's shade, baked once per forest (render.ts bakeShade, shade.frag) instead of every pixel looping over the
// pieces: per layer a picture of the whole world, red how much sky light the column shade under the crowns leaves,
// green how much of what lies there shows past the pieces drawn in front of it. Layer 0 is the floor's, then one per
// tree's trunk, then one per canopy piece (render.ts: SHADE_TRUNK, SHADE_PIECE). The layers are tiles of one texture,
// row by row (baked in one pass: each layer of an array texture would be a render pass of its own). Smooth by nature,
// so a texel a hand wide is plenty.

uniform sampler2D uShadeMap;
uniform vec4 uShadeRect; // the world a tile covers: x0, y0, 1 / width, 1 / height
uniform vec4 uShadeGrid; // tiles across and down; half a texel of a tile, across and down (a lookup stays inside)

/** the shade and the occlusion at world point p in a layer (an explicit level: callers may have discarded already) */
vec2 shadeAt(vec2 p, float layer) {
  vec2 uv = clamp((p - uShadeRect.xy) * uShadeRect.zw, uShadeGrid.zw, 1.0 - uShadeGrid.zw);
  vec2 tile = vec2(mod(layer, uShadeGrid.x), floor(layer / uShadeGrid.x));
  return textureLod(uShadeMap, (tile + uv) / uShadeGrid.xy, 0.0).rg;
}
