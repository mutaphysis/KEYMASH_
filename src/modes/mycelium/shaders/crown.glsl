// The crown's shade on everything under and behind it, faked from its pieces' shapes (no shadow maps): each piece is
// a U, the underside of a superellipse wider on one side, its straight sides running up out of the world. Two kinds:
// - crownShade: the light from the sky above is blocked under a piece, a column below it that leans a little with
//   the light from the upper left, its edge blurring and its darkness fading with the distance below the piece;
// - crownOcclusion: what lies behind a piece is seen only through the gaps of its hanging leaves, deep in its shade,
//   and just past its edge still darkened by the mass in front of it.
// Needs CROWN_PIECES (shaders/index.ts writes it from crown.ts).

uniform vec4 uPieces[CROWN_PIECES];     // per piece, back to front: its centre, its width left and right of it
uniform vec2 uPieceShape[CROWN_PIECES]; // and its underside's height and roundness (a superellipse's exponent)
uniform float uCrownShadow;             // how dark the shade under a piece gets right below it (0: none)

const float SHADE_SLANT = 0.18; // the light comes from the upper left: the shade leans right this much per unit down
const float SHADE_FALL = 420.0; // the shade halves about every 0.7 of this below a piece: the sky lights it from the sides
const float OCCLUDE = 0.55;     // how dark what lies behind a piece gets
const float OCCLUDE_REACH = 150.0; // and how far past the piece's outline the darkening reaches (its leaves hang about 200)

/** piece i's width on p's side of its centre */
float pieceWidth(int i, float x) {
  vec4 P = uPieces[i];
  return x < P.x ? P.z : P.w;
}

/** signed distance to piece i's outline (negative inside); a rough one, good enough to shade by (its wobble left out) */
float pieceSd(int i, vec2 p) {
  vec2 q = p - uPieces[i].xy;
  float w = pieceWidth(i, p.x);
  if (q.y >= 0.0) return abs(q.x) - w;
  vec2 s = uPieceShape[i];
  vec2 d = abs(q) / vec2(w, s.x);
  return (pow(pow(d.x, s.y) + pow(d.y, s.y), 1.0 / s.y) - 1.0) * min(w, s.x);
}

/** the y of piece i's underside at x (its centre's y past its sides) */
float pieceUnderside(int i, float x) {
  vec2 s = uPieceShape[i];
  float d = clamp(abs(x - uPieces[i].x) / pieceWidth(i, x), 0.0, 1.0);
  return uPieces[i].y - s.x * pow(max(1.0 - pow(d, s.y), 0.0), 1.0 / s.y);
}

/** how much sky light reaches p past the pieces above it (1: all); piece `skip` casts none (-1: every piece casts) */
float crownShade(vec2 p, int skip) {
  float open = 1.0;
  for (int i = 0; i < CROWN_PIECES; i++) {
    if (i == skip) continue;
    float below = pieceUnderside(i, p.x) - p.y;
    float h = max(below, 0.0);
    float blur = 50.0 + 0.4 * h;
    float x = p.x - SHADE_SLANT * h;
    float side = abs(x - uPieces[i].x) - 0.9 * pieceWidth(i, x);
    float cover = (1.0 - smoothstep(-blur, blur, side)) * smoothstep(-30.0, 30.0, below) * exp(-h / SHADE_FALL);
    open *= 1.0 - cover;
  }
  return 1.0 - uCrownShadow * (1.0 - open);
}

/** how much of p shows unoccluded behind the pieces from `first` on (1: nothing in front of it) */
float crownOcclusion(vec2 p, int first) {
  float k = 1.0;
  for (int i = 0; i < CROWN_PIECES; i++) {
    if (i < first) continue;
    k *= 1.0 - OCCLUDE * (1.0 - smoothstep(-40.0, OCCLUDE_REACH, pieceSd(i, p)));
  }
  return k;
}
