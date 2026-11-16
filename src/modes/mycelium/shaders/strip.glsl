// The ground strip along the curve without a repeat you can see. The strip isn't seamless, and mirroring it puts a
// Rorschach axis every repeat. Instead the curve is cut into cells (1D Voronoi: jittered borders that wander with
// depth, so a seam is never a straight cut); each cell shows its own stretch of the strip, mirrored half the time,
// and neighbours meet in a height blend: where one has a taller tuft or a brighter leaf, that one stays whole.

uniform sampler2D uStrip; // premultiplied, clamped: no cell reads past its edges

const float CELL = 0.42;   // strip widths per cell
const float SEAM = 0.06;   // half the width of the blend at a border, in strip widths
const float JITTER = 0.18; // borders move up to this share of a cell
const float SWAY = 0.05;   // and wander this far (strip widths) from top to bottom

/** where the border before cell k lies at depth v */
float stripBorder(float k, float v) {
  return (k + (hash12(vec2(k, 7.31)) - 0.5) * 2.0 * JITTER) * CELL + (vnoise(vec2(k * 3.7, v * 2.5)) - 0.5) * 2.0 * SWAY;
}

/** cell k's texel at u, v: its own offset into the strip, maybe mirrored; the gradients keep the mip steady at borders */
vec4 stripCell(float k, vec2 uv, vec2 dx, vec2 dy) {
  vec2 h = hash22(vec2(k, 2.17));
  // how far the cell reaches past its nominal span (jitter, sway, blend) either side: it reads only inside the strip
  float reach = JITTER * CELL + SWAY + SEAM;
  float local = uv.x - k * CELL;
  float u = mix(reach, 1.0 - CELL - reach, h.x) + local;
  if (h.y > 0.5) {
    u = 1.0 - u;
    dx.x = -dx.x;
    dy.x = -dy.x;
  }
  return textureGrad(uStrip, vec2(u, uv.y), dx, dy);
}

/** how much a strip texel stands up: tall where there is moss, brighter bits higher */
float stripHeight(vec4 c) {
  return c.a * (0.4 + 0.6 * luma(c.rgb / max(c.a, 1e-4)));
}

/** the strip at uv (u along the curve in strip widths, v down it), premultiplied */
vec4 strip(vec2 uv) {
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  float k = floor(uv.x / CELL);
  if (uv.x < stripBorder(k, uv.y)) k -= 1.0;
  else if (uv.x >= stripBorder(k + 1.0, uv.y)) k += 1.0;
  float dl = uv.x - stripBorder(k, uv.y);
  float dr = stripBorder(k + 1.0, uv.y) - uv.x;
  vec4 a = stripCell(k, uv, dx, dy);
  float d = min(dl, dr);
  if (d >= SEAM) return a;
  vec4 b = stripCell(dl < dr ? k - 1.0 : k + 1.0, uv, dx, dy);
  return mix(a, b, heightMix(stripHeight(a), stripHeight(b), 0.5 - 0.5 * d / SEAM, 0.12));
}
