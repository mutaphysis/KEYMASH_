// Treasure and stones in the soil, in three passes over the same buffer:
//   halo     the soil darkened around each treasure (damp, disturbed earth: something lies here), in its own shape:
//            its outline spread by a disc of taps of its alpha, so a sword gets a long narrow halo and a pot a round one
//   shadow   a soft dark rim under each thing (the hollow it lies in): its alpha, blurred by a fixed mip level so it
//            is as soft at any zoom, dropped a little (light comes from above)
//   picture  the photographs, lit like things above ground, so toned down into the soil: out of the light, their
//            colour pulled toward the soil's brown, earth clinging to them in blotches, darker with depth as the soil is

in vec2 vWorld;
in vec2 vUV;
in float vDepth;
flat in vec4 vRect;
flat in float vReach;

uniform sampler2D uAtlas; // premultiplied
uniform int uPass;        // 0 picture, 1 shadow, 2 halo
uniform float uDark;      // how dark the shadow or the halo's thickest part is
uniform float uDim;       // the soil's shade: no sun down here
uniform vec3 uEarth;      // the soil's colour: what they are stained toward
uniform vec2 uDrift;      // where the noise is read: each program its own
uniform vec3 uTint;       // the key light
uniform vec3 uDeep;       // what the soil darkens toward, deep down

out vec4 o;

const int HALO_TAPS = 48;

/** the picture's alpha at p, blurred by `lod`; nothing outside its rect, so its neighbours in the atlas don't count */
float coverage(vec2 p, float lod) {
  if (any(lessThan(p, vRect.xy)) || any(greaterThan(p, vRect.zw))) return 0.0;
  return textureLod(uAtlas, p, lod).a;
}

void main() {
  if (uPass == 2) {
    // how much of a disc of vReach texels around this pixel the thing covers: its outline, spread and softened
    // (golden-angle spiral, evenly over the disc)
    vec2 texel = vReach / vec2(textureSize(uAtlas, 0));
    // each tap blurred about as wide as the gaps between taps, so the disc reads as one smooth spread
    float lod = clamp(log2(vReach / 6.0), 1.0, 3.0);
    float a = 0.0;
    for (int i = 0; i < HALO_TAPS; i++) {
      float r = sqrt((float(i) + 0.5) / float(HALO_TAPS));
      float t = float(i) * 2.3999632;
      a += coverage(vUV + vec2(cos(t), sin(t)) * r * texel, lod);
    }
    a /= float(HALO_TAPS);
    // ragged: the spread wanders by noise read in the world (scaled, so it stays nothing where no tap reaches); a
    // blade covers little of any disc, so a little coverage already darkens
    float k = 1.0 - exp(-10.0 * a * (1.0 + (fbm(vWorld / 18.0 + uDrift + 23.0) - 0.5) * 1.2));
    // damp earth rather than black, and gentler up in the light humus, where any dark patch stands out: full
    // strength only deep down, where the soil darkens too. vDepth is this pixel's own depth here: the halo never
    // reaches up into the moss
    float alpha = uDark * k * smoothstep(110.0, 220.0, vDepth) * mix(0.4, 1.0, smoothstep(200.0, 900.0, vDepth));
    o = vec4(uEarth * 0.4 * alpha, alpha);
    return;
  }
  if (uPass == 1) {
    o = vec4(0.0, 0.0, 0.0, textureLod(uAtlas, vUV, 2.0).a * uDark);
    return;
  }
  vec4 c = texture(uAtlas, vUV);
  vec3 rgb = c.rgb / max(c.a, 1e-4);
  // stained: the colour half way to the soil's at the same brightness, then clinging earth, a few millimetres across
  rgb = mix(rgb, luma(rgb) * uEarth / max(luma(uEarth), 1e-3), 0.45);
  float clod = smoothstep(0.5, 0.75, fbm(vWorld / 5.0 + uDrift));
  rgb = mix(rgb, uEarth, 0.7 * clod);
  rgb *= uTint * uDim;
  rgb = mix(rgb, uDeep, 0.6 * smoothstep(150.0, 900.0, vDepth));
  o = vec4(rgb * c.a, c.a);
}
