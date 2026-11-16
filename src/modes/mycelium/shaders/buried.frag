// Treasure and stones in the soil, in four passes over the same buffer:
//   halo     the soil darkened around each treasure (damp, disturbed earth: something lies here), in its own shape:
//            its outline spread by a disc of taps of its alpha, so a sword gets a long narrow halo and a pot a round one
//   shadow   a soft dark rim under each thing (the hollow it lies in): its alpha, blurred by a fixed mip level so it
//            is as soft at any zoom, dropped a little (light comes from above)
//   picture  the photographs, lit like things above ground, so toned down into the soil: out of the light, their
//            colour pulled toward the soil's brown, earth clinging to them in blotches, darker with depth as the soil is
//   glint    now and then a gem catches the light: a short twinkle, a four-pointed star on a bright spot of it, added
//            over the picture (alpha 0: the premultiplied blend adds it). Drawn on the halo quads, which leave its rays room

in vec2 vWorld;
in vec2 vUV;
in float vDepth;
flat in vec4 vRect;
flat in float vReach;
flat in float vGem;

uniform sampler2D uAtlas; // premultiplied
uniform int uPass;        // 0 picture, 1 shadow, 2 halo, 3 glint
uniform float uDark;      // how dark the shadow or the halo's thickest part is
uniform float uDim;       // the soil's shade: no sun down here
uniform vec3 uEarth;      // the soil's colour: what they are stained toward
uniform float uGemStain;  // how much of that staining a gem gets: its colour is the find
uniform float uGemLight;  // a gem's light instead of uDim: it shines out of the soil
uniform vec2 uDrift;      // where the noise is read: each program its own
uniform vec3 uTint;       // the key light
uniform vec3 uDeep;       // what the soil darkens toward, deep down
uniform float uTime;      // seconds, for the glints

out vec4 o;

const int HALO_TAPS = 48;

/** the picture's alpha at p, blurred by `lod`; nothing outside its rect, so its neighbours in the atlas don't count */
float coverage(vec2 p, float lod) {
  if (any(lessThan(p, vRect.xy)) || any(greaterThan(p, vRect.zw))) return 0.0;
  return textureLod(uAtlas, p, lod).a;
}

/** a gem's glint at this pixel: how bright, and its colour (premultiplied, to be added) */
vec3 glint() {
  vec2 size = vec2(textureSize(uAtlas, 0));
  vec2 lo = vRect.xy * size, hi = vRect.zw * size; // the picture, in texels
  float seed = hash12(lo);
  // each gem its own rhythm: a chance every few seconds, and most chances pass dark
  float period = 3.0 + 3.0 * seed;
  float t = uTime / period + seed * 7.0;
  float cycle = floor(t);
  if (hash12(vec2(cycle, seed * 91.0)) > 0.5) return vec3(0.0);
  float s = fract(t) * period; // seconds into the cycle
  float pulse = smoothstep(0.0, 0.1, s) * (1.0 - smoothstep(0.1, 0.5, s));
  if (pulse <= 0.0) return vec3(0.0);
  // where: a bright spot of the gem, a new one each time (a few tries; none found, no glint)
  vec2 c = vec2(-1.0);
  vec3 tone = vec3(1.0);
  for (int i = 0; i < 6; i++) {
    vec2 p = mix(lo, hi, 0.15 + 0.7 * hash22(vec2(cycle + float(i) * 13.1, seed * 57.0)));
    vec4 g = textureLod(uAtlas, p / size, 0.0);
    if (g.a > 0.9 && luma(g.rgb / g.a) > 0.45) {
      c = p;
      tone = g.rgb / g.a;
      break;
    }
  }
  if (c.x < 0.0) return vec3(0.0);
  // a four-pointed star in the picture's texels, its rays growing with the pulse, at most a third of the gem across
  vec2 d = vUV * size - c;
  float len = 0.35 * min(hi.x - lo.x, hi.y - lo.y) * pulse;
  float rays = exp(-abs(d.x) / max(len, 1e-3) * 2.5 - d.y * d.y / 1.6) + exp(-abs(d.y) / max(len, 1e-3) * 2.5 - d.x * d.x / 1.6);
  float core = exp(-dot(d, d) / 6.0);
  // a little of the gem's own colour; deep down it still catches most of the light
  vec3 light = mix(vec3(1.0), tone, 0.35) * mix(1.0, 0.8, smoothstep(150.0, 900.0, vDepth));
  return light * pulse * (0.9 * rays + 1.2 * core);
}

void main() {
  if (uPass == 3) {
    o = vec4(vGem > 0.5 ? glint() : vec3(0.0), 0.0);
    return;
  }
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
  // stained: the colour half way to the soil's at the same brightness, then clinging earth, a few millimetres across;
  // gems only a little, their colour is the find
  float stain = mix(1.0, uGemStain, vGem);
  rgb = mix(rgb, luma(rgb) * uEarth / max(luma(uEarth), 1e-3), 0.45 * stain);
  float clod = smoothstep(0.5, 0.75, fbm(vWorld / 5.0 + uDrift));
  rgb = mix(rgb, uEarth, 0.7 * clod * stain);
  // gems a little brighter than the rest (less shade), and darker deep down only half as much as the soil
  rgb *= uTint * mix(uDim, uGemLight, vGem);
  rgb = mix(rgb, uDeep, 0.6 * smoothstep(150.0, 900.0, vDepth) * mix(1.0, 0.5, vGem));
  o = vec4(rgb * c.a, c.a);
}
