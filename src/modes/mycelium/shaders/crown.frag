// A canopy piece of a tree's crown, made like the forest floor upside down: the canopy strip hangs along the
// piece's outline (cut into the same 1D Voronoi cells as the ground strip, strip.glsl), and above it the leaf fill
// makes its body. They meet as the floor's strip meets its soil: over the strip's dense top the fill takes over in a
// height blend along a wandering line, its leaves showing through the strip's gaps, so the strip's straight top edge
// never shows; below the dense band only the strip, or the fill's own edge would show through its gaps.
// Then its tree's season in its kind's colours (leaves.glsl), and the light: further back is darker, deeper inside a
// piece is darker, under another piece of its own crown lies in its shade (another tree's crown casts none: its shade
// columns cut the crowns behind into dark and lit bands), and behind any piece drawn after it only shows through that
// one's leaves' gaps (both baked into the shade map, shademap.glsl). Clumps of leaves standing out of the crown catch
// the light wherever they hang, low down too, and so do the hanging sprays. Last the air between the tree and the eye.
// Everything is drawn opaque, front to back (render.ts): the body is opaque anyway; the fringe of hanging leaves
// (built with CUTOUT) keeps a texel whole where it is at least CUTOUT_ALPHA covered and drops it otherwise.

in vec2 vWorld;
in vec2 vUV;
flat in int vPiece;

uniform float uSolid;               // v where the canopy strip stops being solid (its rows below have gaps)
uniform float uPieceShade[CROWN_PIECES]; // per piece: further back in its crown is darker
uniform float uPieceLayer;          // the shade map's layer of piece 0
uniform vec3 uTint;                 // the key light
uniform vec3 uFoliage;              // its tree's shade of the season's colours: a gain per channel
uniform float uHaze;                // how far its tree has faded into the air

out vec4 o;

const float DEEP = 0.62;      // how dark a piece's body gets deep inside
const float DEPTH = 320.0;    // over how many view units inward from its outline
const float CLUMP = 1.12;     // how bright a lit clump is, whatever shade it hangs in
const float CLUMP_SHARE = 0.8; // and how much of its shade that lifts
const float SPRAY = 0.12;     // how much brighter the sprays at the tips are
const float CUTOUT_ALPHA = 0.5;

void main() {
  float v = vUV.y;
  // no branch around texture(): every pixel of a quad samples, so the mip levels stay steady
  vec4 s = strip(vec2(vUV.x, clamp(v, 0.0, 1.0)));
  vec3 f = leafFill(vWorld + float(vPiece) * vec2(173.0, 91.0));
  float wander = (fbm(vWorld / 60.0 + float(vPiece) * 7.3) - 0.5) * 0.6 * uSolid;
  // the fill's share by position: whole inside, gone by the bottom of the strip's dense band
  float t = 1.0 - smoothstep(0.1 * uSolid, uSolid, v + wander);
  // above CROWN_OPAQUE of the dense band the fill shows through every gap: opaque there, which is where render.ts
  // cuts a piece's mesh into its body and its fringe
  float under = 1.0 - smoothstep(CROWN_OPAQUE * uSolid, uSolid, v);
  float k = under * heightMix(luma(s.rgb / max(s.a, 1e-4)), luma(f), t, 0.12);
  vec4 c = s + (1.0 - s.a) * under * vec4(f, 1.0);
  c = mix(c, vec4(f, 1.0), k);
#ifdef CUTOUT
  // every texture is read by now (the shade map with an explicit level), so a dropped pixel leaves no derivative
  // without its neighbours
  if (c.a < CUTOUT_ALPHA) discard;
#endif
  vec3 straight = c.rgb / max(c.a, 1e-4);
  vec3 col = leafColor(straight, vWorld) * uFoliage;
  vec2 shadow = shadeAt(vWorld, uPieceLayer + float(vPiece));
  float inside = smoothstep(-DEPTH, 0.0, pieceSd(vPiece, vWorld));
  float shade = uPieceShade[vPiece] * mix(DEEP, 1.0, inside) * shadow.r;
  // lit clumps: patches a few sprays across, their edges following the brighter leaves, so a clump is lit leaf by
  // leaf rather than as a blot
  float bright = luma(straight) / (2.0 * uLeafLuma);
  float clump = smoothstep(0.55, 0.66, fbm(vWorld / vec2(130.0, 90.0) + float(vPiece) * 3.1 + 40.0) + 0.3 * (bright - 0.5));
  float spray = smoothstep(uSolid, 1.0, v);
  float light = mix(shade, CLUMP, clump * CLUMP_SHARE) * (1.0 + SPRAY * spray) * shadow.g;
  o = vec4(mix(col * light * uTint, airAt(vWorld.y), uHaze), 1.0);
}
