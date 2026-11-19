// A tree standing in the forest floor, drawn after the ground, its foot sunk into the moss. The ground is projected
// onto it in world space: the moss carpet climbs the foot (thick at the floor, in cushions, most on what faces up by
// the relief's normal), and below the floor the ground strip itself takes over. Each hands over in a height blend
// rather than a cross-fade: the tree's height is its local relief (its depth against the depth around it), so at every
// texel the bark, the moss or the strip wins whole, the hollows between roots first, and none shows through another.
// The same relief shades the hollows: the deeper, the darker. Each tree is graded on its own (its bark's colour, its
// patches, its moss read at a place of its own), so the same picture twice doesn't look twice the same.

#include "noise.glsl"
#include "blend.glsl"
#include "air.glsl"
#include "mossfill.glsl"
#include "groundat.glsl"
#include "shademap.glsl"

in vec2 vWorld;
in vec2 vUV;

uniform sampler2D uTree;   // premultiplied
uniform sampler2D uRelief; // opaque: normal x, y (0.5 flat, y up), height (nearness)
uniform float uSink;       // how far the foot's bottom lies under the floor (view units)
uniform vec3 uTint;        // the key light
uniform vec2 uDrift;       // where the noise is read: each program its own
uniform vec2 uSeed;        // and each tree its own place in it
uniform vec4 uGrade;       // this tree's bark: a gain per channel, its saturation (1: as photographed)
uniform float uClimb;      // how high its moss climbs (1: CLIMB)
uniform float uShadeLayer; // its layer of the shade map: the canopy's shade, and the crowns in front of it
uniform float uHaze;       // how far it has faded into the air: the further back, the more

out vec4 o;

const float CLIMB = 70.0;            // moss climbs the foot up to about this far above the floor (view units)
const float SHARP = 0.06;            // how wide the mixed edge of a height blend is (in height): small, so nothing ghosts
const vec2 CAVITY = vec2(0.4, 0.75); // how dark the moss and the bark get at the bottom of a hollow
const float PATCHES = 0.14;          // how much darker or paler the bark's damp and dry patches get

/** noise in the world, ± amp: for lines that would otherwise run level */
float ragged(float scale, float amp, float seed) {
  return (fbm(vWorld / scale + uDrift + uSeed + seed) - 0.5) * 2.0 * amp;
}

/** this tree's bark: its colour graded and broken by patches a hand or two across, taller than wide like the streaks
 * rain leaves, damper and darker or drier and paler (premultiplied in, premultiplied out) */
vec3 bark(vec3 c) {
  vec3 g = mix(vec3(luma(c)), c, uGrade.a) * uGrade.rgb;
  return g * (1.0 + PATCHES * (fbm(vWorld / vec2(40.0, 90.0) + uDrift + uSeed + 13.0) - 0.5) * 2.0);
}

/** the moss carpet at this point, lit by the tree's relief: what faces up is lighter, the flanks darker */
vec3 moss(vec4 r) {
  vec2 n = r.xy * 2.0 - 1.0;
  return mossFill(vWorld) * (0.8 + 0.35 * n.y - 0.15 * abs(n.x));
}

/** how far a tree texel stands out: its nearness against the nearness around it (a root's ridge high, the hollow
 * beside it low), plus a little of its own shading for the bark */
float treeHeight(vec4 c, vec4 r) {
  float relief = r.b - textureLod(uRelief, vUV, 4.0).b;
  return clamp(0.5 + 2.5 * relief + 0.15 * (luma(c.rgb / max(c.a, 1e-4)) - 0.4), 0.0, 1.0);
}

/** moss stands up where it is bright: its tips */
float mossHeight(vec3 m) {
  return 0.35 + 0.5 * luma(m);
}

/** how much moss the foot carries here by position: thick at the floor, thinning upward, in cushions, more on what
 * faces up */
float climb(vec4 r, float above) {
  float up = smoothstep(-0.1, 0.5, r.y * 2.0 - 1.0);
  float reach = uClimb * CLIMB * (0.45 + 0.9 * fbm(vec2(vWorld.x / 30.0, 0.5) + uDrift + uSeed + 2.0));
  float w = 1.0 - smoothstep(0.3 * reach, reach, above);
  return w * smoothstep(0.4, 0.6, fbm(vWorld / 11.0 + uDrift + uSeed + 5.0) + 0.3 * up - 0.05) * mix(0.3, 1.0, up);
}

/** the ground over the tree, within the tree's coverage only: drawn over the ground it came from, so outside the
 * silhouette nothing changes */
vec4 groundOver(vec4 c, vec4 g) {
  vec4 m = g + (1.0 - g.a) * c;
  return m * (c.a / max(m.a, 1e-4));
}

void main() {
  float above = vWorld.y - floorAt(vWorld.x);
  // no early return or branch around texture(): its derivatives (and the ground lookups' below) need every pixel of
  // a quad, or the quads along the picture's edge pick a mip level of their own and draw a line there
  vec4 c = texture(uTree, vUV);
  vec4 r = texture(uRelief, vUV);
  float h = treeHeight(c, r);
  vec3 m = moss(r);
  // climb() is the moss's share by position; the height blend turns it into whole texels of moss or bark, the
  // hollows mossed first. Scaled up a little: a share of 0.5 should already cover the hollows
  float k = heightMix(h, mossHeight(m), clamp(1.3 * climb(r, above), 0.0, 1.0), SHARP);
  // deep places lie in shadow: the moss in a hollow darkens with its depth, the bark a little (its photo has its own
  // shading already). The blend above decides on the unshaded moss, so the shade doesn't move it
  float cavity = smoothstep(0.1, 0.6, h);
  vec3 barkShaded = bark(c.rgb) * mix(CAVITY.y, 1.0, cavity);
  c = vec4(mix(barkShaded, m * mix(CAVITY.x, 1.0, cavity) * c.a, k), c.a);
  // below the floor the strip takes over along a ragged line, its tufts in front of the bark first; where the strip
  // is clear (above its tufts) its height is nothing and the tree stays
  vec4 g = groundAt(vWorld);
  float under = 1.0 - smoothstep(-uSink, 10.0, above + ragged(9.0, 10.0, 7.0));
  c = mix(c, groundOver(c, g), heightMix(h, stripHeight(g) + 0.2 * g.a, under, SHARP));
  // the trunk rises into the crown: in its shade, and behind its own crown and the crowns of the trees in front seen
  // only through their leaves' gaps. Then the air between it and the eye, gone by the floor: the ground projected
  // onto its foot must match the floor around it
  vec2 shadow = shadeAt(vWorld, uShadeLayer);
  vec3 lit = c.rgb * uTint * shadow.r * shadow.g;
  o = vec4(mix(lit, airAt(vWorld.y) * c.a, uHaze * smoothstep(20.0, 220.0, above)), c.a);
}
