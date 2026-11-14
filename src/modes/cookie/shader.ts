// COOKIE_'s shaders. The scene is one raymarched distance field: dough, cookies (their footprints
// come from the field atlas), coating, piping, toppings, the rolling pin and the cutters. Crumbs are
// instanced billboards drawn into the same target against the scene's depth.
import { FIELD_EXT, FIELD_N } from './shapes';

/** one triangle that covers the screen */
export const FULL_VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2. - 1., 0., 1.);
}`;

const TONE = `
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }
vec3 display(vec3 c) { return pow(aces(c * .72), vec3(1. / 2.2)); }
const vec3 KEY_DIR = vec3(-.4497, .7995, .3997);
vec3 keyLight(float heat) { return vec3(1., .94, .84) * 1.75 * mix(1., .25, heat); }
vec3 skyLight(float up, float heat) { return mix(vec3(.2, .15, .11), vec3(.42, .5, .62), up * .5 + .5) * .6 * mix(1., .45, heat); }
`;

export const SCENE_FS = `#version 300 es
precision highp float;
precision highp sampler2D;

uniform vec2 uRes;
uniform vec3 uCamPos, uCamRight, uCamUp, uCamFwd;
uniform float uTanFov, uShift;
uniform mat4 uViewProj;
uniform float uTime, uGentle, uTopY, uSpot;
uniform float uLift, uDoughR, uRAfter, uSquash, uPinX, uPinDir, uPin, uPinY, uPinLen, uPinW, uTBefore, uTAfter, uFlour, uDoughOn;
uniform float uCutterY, uCutter, uGap, uEdge, uChipT, uHeat, uBaked, uPuff, uCoatReveal, uPattern, uTopT, uDeco, uErode, uDropH;
uniform vec4 uCookie[3]; // x, z, gone
uniform vec2 uRot[3];    // cos, sin of the cookie's turn
uniform int uCount;
uniform float uSize, uThick, uRise;
uniform vec2 uCoat;      // type (0 none, 1 icing, 2 chocolate, 3 glaze), flow (0 thick, 1 smooth, 2 runny)
uniform vec2 uCoatP;     // thickness, margin from the edge
uniform vec3 uHalf;      // direction of the dipped half, z = 1 if only half is coated
uniform vec3 uColor, uAccent, uRaw, uBakedCol, uInside;
uniform float uChips;    // share of chip cells that hold one
uniform vec3 uTopA, uTopB; // kind (1 sprinkles, 2 sugar, 3 strands, 4 pearls), cell size, share of cells
uniform float uGlitter, uBorder, uBorderIn, uPipeOn, uEyeR, uLevel;
uniform int uPatternKind, uDoughKind;
uniform vec4 uFix[12];   // per cookie 4: local x, y, kind (1 eye, 2 cherry, 3 almond), scale
uniform sampler2D uField;
out vec4 fragColor;

const float EXT = ${FIELD_EXT.toFixed(4)};
const float FN = ${FIELD_N.toFixed(1)};
const vec3 CHAR = vec3(.006, .004, .003);
const vec3 DARK_CHOC = vec3(.033, .01, .005);
${TONE}

// ---- noise ----
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 h23(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }
float h31(vec3 p3) { p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float n3(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3. - 2. * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1, 0, 0)), f.x), mix(h31(i + vec3(0, 1, 0)), h31(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h31(i + vec3(0, 0, 1)), h31(i + vec3(1, 0, 1)), f.x), mix(h31(i + vec3(0, 1, 1)), h31(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { return .5 * n3(p) + .3 * n3(p * 2.03 + 7.) + .2 * n3(p * 4.1 + 13.); }
float sat(float x) { return clamp(x, 0., 1.); }
float smax(float a, float b, float k) { float h = max(k - abs(a - b), 0.) / k; return max(a, b) + h * h * k * .25; }

// ---- the cookies' footprints ----
struct Ck { int i; vec2 q; float R; float G; float B; };

// R outline, G bite, B piping; in cookie units. Past the tile's edge the outline is at least that much further.
vec3 field(int i, vec2 q) {
  vec2 uv = q / (2. * EXT) + .5;
  vec2 cl = clamp(uv, .5 / FN, 1. - .5 / FN);
  vec3 f = texture(uField, vec2((float(i) + cl.x) / 3., cl.y)).rgb;
  f.r += length((uv - cl) * 2. * EXT);
  return f;
}

void nearest(vec3 p, out Ck c) {
  float best = 1e9;
  int bi = -1;
  for (int i = 0; i < 3; i++) {
    if (i >= uCount) break;
    vec4 k = uCookie[i];
    if (k.z > .5) continue;
    vec2 d = p.xz - k.xy;
    float l = dot(d, d);
    if (l < best) { best = l; bi = i; }
  }
  c.i = bi; c.q = vec2(0.); c.R = 1e3; c.G = 1.; c.B = 1.;
  if (bi < 0) return;
  vec2 v = (p.xz - uCookie[bi].xy) * vec2(1., -1.) / uSize;
  vec2 r = uRot[bi];
  c.q = vec2(r.x * v.x + r.y * v.y, -r.y * v.x + r.x * v.y);
  vec3 f = field(bi, c.q);
  c.R = f.r + uErode / uSize; c.G = f.g; c.B = f.b;
}

// ---- shapes ----
float sdDough(vec3 p) {
  // behind the pin (and right under it) the dough is pressed and wider; it rises to the full thickness ahead
  float s = smoothstep(0., uPinW, (p.x - uPinX) * uPinDir);
  float h = mix(uTAfter, uTBefore, s);
  float sy = 1. - .25 * uSquash;
  float sxz = inversesqrt(sy);
  vec3 q = p - vec3(0., h * sy + uLift, 0.);
  q.y /= sy; q.xz /= sxz;
  float R = max(mix(uRAfter, uDoughR, s), h);
  R += .05 * (R - h) * sin(3. * atan(q.z, q.x) + 1.3); // a rolled sheet is never a circle
  vec2 d = vec2(length(q.xz) - R + h, abs(q.y));
  return (min(max(d.x, d.y), 0.) + length(max(d, 0.)) - h) * min(sy, sxz) + uErode;
}

// the dome is flat away from the edge: a height that followed the distance all the way would crease along the middle
float topH(float Rw) { return uThick * (1. + .6 * uRise * uPuff * (1. - smoothstep(-.35, 0., Rw))); }

float sdBody(vec3 p, float Rw, float H) {
  float er = uEdge * min(.07 + .125 * uThick, H * .5);
  vec2 w = vec2(Rw + er, p.y - H + er);
  return min(max(w.x, w.y), 0.) + length(max(w, 0.)) - er;
}

float sdRoundCone(vec3 p, float r1, float r2, float h) {
  float b = (r1 - r2) / h, a = sqrt(1. - b * b);
  vec2 q = vec2(length(p.xz), p.y);
  float k = dot(q, vec2(-b, a));
  if (k < 0.) return length(q) - r1;
  if (k > a * h) return length(q - vec2(0., h)) - r2;
  return dot(q, vec2(a, b)) - r1;
}

float fixRadius(float kind) { return kind < 1.5 ? uEyeR : kind < 2.5 ? .13 : .2; }

// The main march's ray: an empty cell can then be crossed in one step instead of creeping along its
// wall, which a ray seen edge-on never leaves (a thin line through the cookie while pieces fall).
bool gRay = false;
vec3 gRd = vec3(0.);

// One layer of scattered pieces, one per grid cell at most. L is the point in the cookie's frame
// (x, height, y). An empty cell answers with the way to its wall, so the march walks on.
float pieces(vec3 L, int ci, float kind, float cs, float keep, float T, float span, float salt, float y0) {
  vec2 cell = floor(L.xz / cs);
  vec2 f = L.xz - (cell + .5) * cs;
  float guard = cs * .5 - max(abs(f.x), abs(f.y)) + .012;
  if (gRay) {
    // along the ray to the cell's wall; every piece keeps .012 away from its walls
    vec2 v = vec2(gRd.x, -gRd.z) / uSize;
    vec2 r = uRot[ci];
    vec2 dq = vec2(r.x * v.x + r.y * v.y, -r.y * v.x + r.x * v.y);
    vec2 e = (cs * .5 - f * sign(dq)) / max(abs(dq), 1e-5);
    guard = max(guard, min(e.x, e.y) / uSize + .012);
  }
  vec3 h = h23(cell + salt + float(ci) * 17.);
  if (h.z > keep) return guard;
  vec3 h2 = h23(cell * 1.7 + salt + 5.);
  float delay = h2.x * span;
  if (T < delay) return guard;
  // a piece stays inside its cell: the march only ever sees the cell it is in
  float reach = kind < .5 ? .075 : kind < 1.5 ? .062 : kind < 2.5 ? .024 : kind < 3.5 ? .062 : .045;
  vec2 ctr = (cell + .5 + (h.xy - .5) * 2. * clamp((cs * .5 - .012 - reach) / cs, 0., .22)) * cs;
  vec3 fc = field(ci, ctr);
  float Rc = fc.r + uErode / uSize;
  if (Rc > -(max(uCoatP.y, .02) / uSize + .07) || fc.g < .04 || fc.b < .07) return guard;
  if (kind > 3.5 && abs(Rc + .26) > .07) return guard;
  if (uHalf.z > .5 && dot(ctr, uHalf.xy) > -.06) return guard;
  for (int j = 0; j < 4; j++) {
    vec4 fx = uFix[ci * 4 + j];
    if (fx.z > .5 && distance(ctr, fx.xy) < fixRadius(fx.z) + .06) return guard;
  }
  float fall = 1. - sat((T - delay) / .3);
  vec3 d = L - vec3(ctr.x, y0 + .5 * fall * fall, ctr.y);
  float a = h2.y * 6.2832;
  vec2 dir = vec2(cos(a), sin(a));
  float sd;
  if (kind < .5) {
    d.y /= 1. - .15 * uPuff;
    sd = sdRoundCone(d + vec3(0., .012, 0.), .07, .025, .065);
  } else if (kind < 1.5) {
    float t = clamp(dot(d.xz, dir), -.045, .045);
    sd = length(d - vec3(dir.x * t, .014, dir.y * t)) - .017;
  } else if (kind < 2.5) {
    vec3 b = abs(d - vec3(0., .014, 0.)) - .01;
    sd = length(max(b, 0.)) + min(max(b.x, max(b.y, b.z)), 0.) - .008;
  } else if (kind < 3.5) {
    float t = clamp(dot(d.xz, dir), -.05, .05);
    sd = length(d - vec3(dir.x * t, .01, dir.y * t)) - .012;
  } else {
    sd = length(d - vec3(0., .036, 0.)) - .045;
  }
  return min(sd, guard);
}

float pipe2D(vec2 q, float R, float B) {
  float d = 1e3;
  if (uPatternKind == 1) {
    d = abs(mod(q.x * .819 + q.y * .574 + .11, .26) - .13) - .035;
  } else if (uPatternKind == 2) {
    float row = clamp(floor(q.y / .42 + .5), -1., 1.);
    float tri = abs(fract(q.x / .3) - .5) * 4. - 1.;
    d = abs(q.y - row * .42 - .12 * tri) * .8 - .035;
  } else if (uPatternKind == 3) {
    d = abs(mod(length(q) - .26 * atan(q.y, q.x) / 6.2832, .26) - .13) - .035;
  }
  if (uBorder > .5) d = min(d, abs(R + uBorderIn) - .03);
  d = max(d, q.x - mix(-1.5, 1.5, uPattern));
  float swept = q.x - mix(-1.5, 1.5, uDeco);
  d = max(d, -max(B - .07, swept)); // the pattern makes room for letters and the mouth
  return min(d, max(B, swept));
}

// material ids: 0 tray, 1 dough, 2 cookie, 3 coating, 4 piping, 5 chips, 6/7 toppings, 8 eye, 9 cherry, 10 almond, 11 pin, 12 cutter
void cookie(vec3 p, Ck c, bool lite, inout vec2 res) {
  float Rw = c.R * uSize - .05 * uRise * uPuff;
  float H = topH(Rw);
  float body = sdBody(p, Rw, H);
  float bite = 1e3;
  if (c.G < .3) {
    bite = c.G * uSize;
    if (!lite) bite += .014 * (n3(p * 30.) - .5); // a bitten wall is rough
    body = max(body, -bite);
  }
  if (body < res.x) res = vec2(body, 2.);
  if (!lite && body > .3 + uDropH) {
    // far away: everything that sits on the cookie is within .3 of it, so stop short of that. Only for
    // the march: shadows and occlusion need a distance without this jump, or rings show on the tray.
    res.x = min(res.x, body - .25 - uDropH);
    return;
  }

  float base = body;
  float tc = 0.;
  bool covered = false;
  if (uCoat.x > .5 && uCoatReveal > 0.) {
    tc = uCoatP.x;
    float region = Rw + uCoatP.y;
    if (uHalf.z > .5) {
      region = max(Rw - .1, dot(c.q, uHalf.xy) * uSize);
    } else if (uCoat.y > 1.5) {
      // runny: it creeps over the edge and drips where the noise says so
      vec2 dir = c.q / max(length(c.q), 1e-3);
      float drip = smoothstep(.6, .78, n3(vec3(dir * 4.5, float(c.i) * 3.7 + 1.)));
      region = Rw + .1 - .28 * drip;
      region = max(region, min(H - uThick * (.1 + .9 * drip) - p.y, Rw + .03));
    }
    region = max(region, (length(c.q) + .05 - uCoatReveal * 1.75) * uSize); // poured from the middle; nothing at all before
    covered = region < 0.;
    float coat = max(smax(body - tc, region, tc * .8), -bite);
    if (coat < res.x) res = vec2(coat, 3.);
    base = min(base, coat);
  }

  if (!lite && uPipeOn > .5 && p.y > H - .15) {
    float pd = max(pipe2D(c.q, c.R, c.B), c.R + .07);
    float d = max(smax(base - .026, pd * uSize, .02), max(-bite, H - .1 - p.y));
    if (d < res.x) res = vec2(d, 4.);
  }

  float y0 = (H + (covered ? tc : 0.)) / uSize;
  vec3 L = vec3(c.q.x, p.y / uSize, c.q.y);
  for (int j = 0; j < 4; j++) {
    vec4 fx = uFix[c.i * 4 + j];
    if (fx.z < .5 || fx.w < .01) continue;
    vec3 d = (L - vec3(fx.x, y0, fx.y)) / fx.w;
    float sd, id;
    if (fx.z < 1.5) { sd = (length(d / vec3(uEyeR, uEyeR * .55, uEyeR)) - 1.) * uEyeR * .55; id = 8.; }
    else if (fx.z < 2.5) { sd = length(d - vec3(0., .09, 0.)) - .13; id = 9.; }
    else { sd = (length((d - vec3(0., .03, 0.)) / vec3(.2, .06, .11)) - 1.) * .06; id = 10.; }
    sd *= fx.w * uSize;
    if (sd < res.x) res = vec2(sd, id);
  }

  // above the layer of pieces the march must not step past its top: they are only looked at inside it
  float over = p.y - (H + .16 + uDropH);
  if (!lite && Rw < .05 && over > 0.) res.x = min(res.x, over + .01);
  if (!lite && Rw < .05 && over <= .01) {
    if (uChips > 0. && uChipT >= 0.) {
      float d = pieces(L, c.i, 0., .3, uChips, uChipT, .6, 3., y0) * uSize;
      if (d < res.x) res = vec2(d, 5.);
    }
    if (uTopT >= 0.) {
      if (uTopA.x > .5) {
        float d = pieces(L, c.i, uTopA.x, uTopA.y, uTopA.z, uTopT, 1.1, 11., y0) * uSize;
        if (d < res.x) res = vec2(d, 6.);
      }
      if (uTopB.x > .5) {
        float d = pieces(L, c.i, uTopB.x, uTopB.y, uTopB.z, uTopT, 1.1, 23., y0) * uSize;
        if (d < res.x) res = vec2(d, 7.);
      }
    }
  }
}

vec2 map(vec3 p, bool lite) {
  vec2 res = vec2(1e5, 0.);
  Ck c;
  c.i = -1; c.q = vec2(0.); c.R = 1e3; c.G = 1.; c.B = 1.;
  if (uGap > 0. || uCutter > 0.) nearest(p, c);
  float Rw = c.R * uSize;
  if (uDoughOn > .5) {
    float d = sdDough(p);
    if (uGap > 0.) d = max(d, uGap - Rw);
    res = vec2(d, 1.);
  }
  if (uGap > 0. && c.i >= 0) cookie(p, c, lite, res);
  if (uPin > 0.) {
    vec3 pp = p - vec3(uPinX, uPinY, 0.);
    float d = length(vec3(pp.xy, pp.z - clamp(pp.z, -uPinLen, uPinLen))) - .28;
    d = min(d, length(vec3(pp.xy, pp.z - clamp(pp.z, -uPinLen - .8, uPinLen + .8))) - .09);
    if (d < res.x) res = vec2(d, 11.);
  }
  if (uCutter > 0. && c.i >= 0) {
    const float hh = .24;
    float Rc = Rw - uErode;
    float d = max(abs(Rc) - .012, abs(p.y - uCutterY - hh) - hh);
    d = min(d, max(abs(Rc) - .03, abs(p.y - uCutterY - 2. * hh + .02) - .02));
    if (d < res.x) res = vec2(d, 12.);
  }
  return res;
}

vec3 calcNormal(vec3 p, float t) {
  vec2 e = vec2(1., -1.) * max(.0012, .0005 * t);
  vec3 g = e.xyy * map(p + e.xyy, false).x + e.yyx * map(p + e.yyx, false).x + e.yxy * map(p + e.yxy, false).x + e.xxx * map(p + e.xxx, false).x;
  return normalize(g + vec3(0., 1e-7, 0.)); // never a zero vector
}

// The pin's shadow in closed form: a march that grazes the dough on its way up runs out of steps
// before it reaches a pin high above, and the tray would show a lit ring there.
float pinShadow(vec3 ro, vec3 rd) {
  vec3 o = ro - vec3(uPinX, uPinY, 0.);
  float t = max(-dot(o.xy, rd.xy) / max(dot(rd.xy, rd.xy), 1e-6), 0.); // nearest to the pin's axis
  vec3 p = o + rd * t;
  float d = length(vec3(p.xy, p.z - clamp(p.z, -uPinLen, uPinLen))) - .28;
  return 9. * d / max(t, .02);
}

float shadow(vec3 ro, vec3 rd) {
  float res = uPin > 0. ? pinShadow(ro, rd) : 1., t = .02;
  for (int i = 0; i < 18; i++) {
    vec3 p = ro + rd * t;
    if (p.y > uTopY) break;
    float h = map(p, true).x;
    res = min(res, 9. * h / t);
    if (res < .02) break;
    t += clamp(h, .02, .4);
  }
  res = sat(res);
  return res * res * (3. - 2. * res);
}

float occlusion(vec3 p, vec3 n) {
  float o = 0., s = 1.;
  for (int i = 0; i < 4; i++) {
    float h = .03 + .09 * float(i);
    vec3 q = p + n * h;
    o += (h - min(map(q, true).x, q.y)) * s;
    s *= .7;
  }
  return sat(1. - 2.2 * o);
}

// a small studio: a soft box overhead, a strip light at the back, a warm horizon; the oven glows instead
vec3 env(vec3 d) {
  vec3 c = mix(vec3(.22, .17, .13), vec3(.45, .5, .6), smoothstep(-.2, .6, d.y)) * .6;
  vec2 b = d.xz / max(d.y, .05);
  c += vec3(1., .97, .9) * 5. * smoothstep(1.1, .5, abs(b.x + .3)) * smoothstep(.9, .4, abs(b.y - .2)) * step(0., d.y);
  c += vec3(.9, .95, 1.) * 2. * smoothstep(.12, 0., abs(d.y - .35)) * smoothstep(-.2, -.5, d.z);
  return mix(c, c * .25 + vec3(1., .38, .08) * (2.5 * smoothstep(.3, 0., abs(d.y - .25)) + .15), uHeat * .85);
}

const vec3 CANDY[6] = vec3[6](vec3(.85, .05, .07), vec3(.98, .6, .05), vec3(.1, .52, .17), vec3(.1, .32, .9), vec3(.93, .26, .52), vec3(.93, .91, .85));

vec3 doughColor(vec3 p, out float flake) {
  vec3 col = uRaw;
  flake = 0.;
  if (uDoughKind == 1) col *= mix(1., .55, smoothstep(.72, .8, n3(p * 42.)));
  else if (uDoughKind == 3) { flake = smoothstep(.55, .7, n3(p * vec3(13., 26., 13.))); col = mix(col, col * 1.25 + .03, flake); }
  else if (uDoughKind == 4) col = mix(col, col * 1.3 + .04, smoothstep(.7, .8, n3(p * 36.)));
  return col;
}

vec3 shade(vec3 p, vec3 n, vec3 rd, float id, float t) {
  Ck c;
  nearest(p, c);
  float Rw = c.R * uSize;
  vec3 alb = vec3(.8);
  float rough = .8, f0 = .04, wrap = 0., metal = 0., sparkle = 0.;

  if (id < .5) {
    // baking paper
    vec2 g = vec2(n3(vec3(p.xz * 6. + vec2(.2, 0.), 1.)), n3(vec3(p.xz * 6. + vec2(0., .2), 1.))) - n3(vec3(p.xz * 6., 1.));
    n = normalize(n + vec3(g.x, 0., g.y) * .5);
    alb = vec3(.7, .64, .54) * (.92 + .16 * fbm(vec3(p.xz * 1.3, 0.)));
    if (uBaked > .3) alb *= mix(1., .82, smoothstep(.2, -.02, Rw) * sat((uBaked - .3) * 3.));
    float fl = uFlour * smoothstep(uSpot * 1.2, uSpot * .45, length(p.xz));
    alb = mix(alb, vec3(.95, .94, .9), fl * (.3 * smoothstep(.4, .7, fbm(vec3(p.xz * 2.5, 5.))) + .3 * step(.86, h21(floor(p.xz * 60.)))));
    rough = .9;
  } else if (id < 2.5) {
    float flake;
    vec3 col = doughColor(p, flake);
    col = mix(col, col * 1.12 + .015, smoothstep(.35, .85, fbm(p * 7. + 2.))); // kneaded unevenly: soft lighter patches, always the same
    rough = .85; wrap = .5;
    if (id > 1.5) {
      float b = uBaked * (.75 + .25 * exp(min(Rw, 0.) / .15)) + .18 * (fbm(p * 5.) - .5) * sat(uBaked * 4.);
      vec3 done = uBakedCol * mix(1., col.g / max(uRaw.g, .01), .6);
      col = mix(col, done, sat(b));
      col = mix(col, CHAR, sat((b - 1.1) / .35));
      float cr = 1. - abs(2. * n3(p * vec3(7., 3., 7.) + 3.) - 1.);
      col *= 1. - .3 * smoothstep(.93, .99, cr) * smoothstep(.4, .65, n3(p * 2.3 + 9.)) * uRise * uPuff * step(.5, n.y); // a few cracks, not a net
      if (c.G * uSize < .04 && n.y < .75) {
        // inside: paler, full of pores
        col = uInside * (.8 + .4 * n3(p * 45.)) * (1. - .35 * smoothstep(.55, .8, n3(p * 30. + 9.)));
        col = mix(col, CHAR * 4., sat((uBaked - 1.5) / .5) * .6);
        rough = .95;
      }
    }
    alb = col * (.9 + .2 * n3(p * 55.));
    n = normalize(n + .1 * (vec3(n3(p * 60.), n3(p * 60. + 19.), n3(p * 60. + 37.)) - .5));
  } else if (id < 3.5) {
    alb = uColor;
    if (uCoat.x < 1.5) { rough = uCoat.y < .5 ? .6 : uCoat.y < 1.5 ? .28 : .16; wrap = .6; }
    else if (uCoat.x < 2.5) {
      rough = uCoat.y < .5 ? .35 : uCoat.y < 1.5 ? .14 : .1; f0 = .06;
      if (uCoat.y < .5) n = normalize(n + .12 * vec3(n3(p * 9.) - .5, 0., n3(p * 9. + 5.) - .5));
    } else {
      alb = mix(mix(uRaw, uBakedCol, sat(uBaked)), mix(vec3(1.), uColor, .35), .55);
      rough = .12; wrap = .5;
    }
    sparkle = uGlitter;
  } else if (id < 4.5) {
    alb = uAccent; rough = .5; wrap = .3; sparkle = uGlitter;
  } else if (id < 5.5) {
    alb = DARK_CHOC; rough = mix(.5, .15, uPuff); f0 = .06;
  } else if (id < 7.5) {
    vec3 top = id < 6.5 ? uTopA : uTopB;
    float salt = id < 6.5 ? 11. : 23.;
    vec3 h = h23(floor(c.q / top.y) * 2.3 + salt + float(c.i));
    if (top.x < 1.5) { alb = CANDY[int(h.x * 5.99)]; rough = .3; }
    else if (top.x < 2.5) { alb = vec3(.92); rough = .25; sparkle = 1.; }
    else if (top.x < 3.5) { alb = DARK_CHOC * 1.6; rough = .4; }
    else { alb = vec3(.86, .87, .9); rough = .16; metal = 1.; }
  } else if (id < 8.5) {
    alb = vec3(.93); rough = .2;
    for (int j = 0; j < 4; j++) {
      vec4 fx = uFix[c.i * 4 + j];
      if (fx.z < .5 || fx.z > 1.5) continue;
      vec2 d = (c.q - fx.xy) / (uEyeR * fx.w);
      if (length(d) < .5) alb = vec3(.012);
      if (length(d - vec2(-.16, .18)) < .13) alb = vec3(1.);
    }
  } else if (id < 9.5) {
    alb = vec3(.55, .012, .03); rough = .1; f0 = .06; wrap = .3;
  } else if (id < 10.5) {
    alb = vec3(.62, .42, .22) * (.85 + .3 * n3(p * vec3(40., 40., 9.))); rough = .7;
  } else if (id < 11.5) {
    vec3 pp = p - vec3(uPinX, uPinY, 0.);
    float a = atan(pp.y, pp.x) + uPinX / .28; // the pin turns as it rolls
    float grain = n3(vec3(cos(a) * 2.5, sin(a) * 2.5, pp.z * .7) + 4.);
    grain = .5 + .5 * sin(grain * 30. + pp.z * 2.);
    alb = mix(vec3(.5, .3, .13), vec3(.33, .18, .07), grain * .6);
    rough = .45;
  } else {
    alb = vec3(.78, .8, .84); rough = .25; metal = 1.;
  }

  float ndl = dot(n, KEY_DIR);
  float sh = ndl > -wrap ? shadow(p + n * .012, KEY_DIR) : 0.;
  float ao = id > 4.5 && id < 10.5 ? 1. : occlusion(p, n); // small pieces: the sample steps are bigger than they are
  vec3 keyC = keyLight(uHeat);
  float diff = max((ndl + wrap * .5) / (1. + wrap * .5), 0.);
  vec3 oven = vec3(1., .4, .09) * 2.4 * uHeat * (.4 + .6 * max(dot(n, normalize(vec3(0., .45, -1.))), 0.));
  vec3 col = alb * (1. - metal) * (diff * sh * keyC + (skyLight(n.y, uHeat) + oven) * ao);
  if (wrap > 0.) col += alb * keyC * .14 * wrap * sat(1. + map(p - n * .08, true).x / .08) * (.4 + .6 * sh); // light through thin parts

  vec3 hv = normalize(KEY_DIR - rd);
  float ndh = max(dot(n, hv), 0.), ndv = max(dot(n, -rd), 0.);
  float a2 = rough * rough * rough * rough;
  float dd = ndh * ndh * (a2 - 1.) + 1.;
  float D = min(a2 / (3.1416 * dd * dd), 40.);
  float fres = f0 + (1. - f0) * pow(1. - ndv, 5.);
  vec3 specC = mix(vec3(1.), alb, metal);
  float F = mix(fres, 1., metal);
  col += specC * keyC * D * mix(f0, 1., metal) * .25 * max(ndl, 0.) * sh;
  col += specC * env(reflect(rd, n)) * F * (1. - rough) * (1. - rough) * mix(.35, 1., ao);

  if (sparkle > 0. && n.y > .3) {
    // tiny facets that catch the key light
    vec3 cell = floor(p * 55.);
    vec3 fd = normalize(vec3(h31(cell), h31(cell + 7.), h31(cell + 13.)) - .5 + n * .6);
    float reveal = sat(uTopT / .8);
    col += keyC * (5. + 4. * uLevel) * step(mix(.9996, .994, sparkle), dot(fd, hv)) * reveal * (.3 + .7 * sh); // louder music, brighter glitter
  }
  // the light falls on the middle of the tray
  return col * mix(1., .2, smoothstep(.75, 2.4, length(p.xz) / uSpot));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes * 2. - 1.;
  vec2 sv = vec2(uv.x, uv.y - uShift);
  vec3 rd = normalize(uCamFwd + uCamRight * sv.x * uTanFov * uRes.x / uRes.y + uCamUp * sv.y * uTanFov);
  if (uHeat > 0. && uGentle < .5) rd = normalize(rd + uCamRight * .004 * uHeat * (n3(vec3(gl_FragCoord.xy * .03, uTime * 1.6)) - .5)); // hot air
  vec3 ro = uCamPos;
  float tEnd = rd.y < -1e-4 ? -ro.y / rd.y : 200.;
  float t = rd.y < -1e-4 ? max((uTopY - ro.y) / rd.y, 0.) : 0.;
  float id = 0.;
  gRay = true;
  gRd = rd;
  for (int i = 0; i < 64; i++) {
    vec2 m = map(ro + rd * t, false);
    id = m.y;
    if (m.x < min(.0007 * t, .008)) break;
    t += m.x * .85;
    if (t >= tEnd) break;
  }
  gRay = false; // normals, shadows and occlusion sample around points, not along this ray
  if (t >= tEnd) { t = tEnd; id = 0.; }
  vec3 p = ro + rd * t;
  vec3 n = id < .5 ? vec3(0., 1., 0.) : calcNormal(p, t);
  vec3 col = shade(p, n, rd, id, t);
  col *= 1. - .35 * uHeat * dot(uv, uv) * .5;
  vec4 clip = uViewProj * vec4(p, 1.);
  gl_FragDepth = clamp(clip.z / clip.w * .5 + .5, 0., 1.);
  fragColor = vec4(display(col), 1.);
}`;

/** crumbs: per instance position, radius, colour, seed. uShadow = 1 draws their blob shadows on the tray. */
export const CRUMB_VS = `#version 300 es
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 iPos;   // xyz, radius
layout(location = 2) in vec4 iColor; // rgb, seed
uniform mat4 uViewProj;
uniform vec3 uCamRight, uCamUp;
uniform float uShadow;
out vec2 vUv;
out vec3 vColor;
out float vSeed, vLift;
void main() {
  vUv = aCorner;
  vColor = iColor.rgb;
  vSeed = iColor.a;
  vLift = iPos.y;
  vec3 p = uShadow > .5
    ? vec3(iPos.x + aCorner.x * iPos.w * 2.2, .004, iPos.z + aCorner.y * iPos.w * 2.2)
    : iPos.xyz + (uCamRight * aCorner.x + uCamUp * aCorner.y) * iPos.w * 1.3;
  gl_Position = uViewProj * vec4(p, 1.);
}`;

export const CRUMB_FS = `#version 300 es
precision highp float;
in vec2 vUv;
in vec3 vColor;
in float vSeed, vLift;
uniform vec3 uCamRight, uCamUp, uCamFwd;
uniform float uShadow, uHeat;
out vec4 fragColor;
${TONE}
void main() {
  if (uShadow > .5) {
    float a = .45 * exp(-3. * vLift) * smoothstep(1., .2, length(vUv));
    fragColor = vec4(vec3(1. - a), 1.);
    return;
  }
  vec2 uv = vUv * 1.3;
  float th = atan(uv.y, uv.x);
  float rad = 1. + .16 * sin(th * 3. + vSeed) + .1 * sin(th * 5. + vSeed * 2.3);
  float l = length(uv) / rad;
  if (l > 1.) discard;
  vec3 n = normalize(uCamRight * uv.x + uCamUp * uv.y - uCamFwd * sqrt(1. - l * l) * rad);
  n = normalize(n + .25 * vec3(sin(vSeed + uv.x * 9.), sin(vSeed * 1.7 + uv.y * 8.), 0.));
  vec3 col = vColor * (max(dot(n, KEY_DIR) * .7 + .3, 0.) * keyLight(uHeat) + skyLight(n.y, uHeat));
  fragColor = vec4(display(col), 1.);
}`;

/** the scene target stretched over the canvas, with a soft vignette and a little dither against banding */
export const BLIT_FS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = texture(uTex, uv).rgb;
  vec2 v = uv - .5;
  c *= 1. - .3 * smoothstep(.3, 1., dot(v, v) * 2.);
  vec3 p3 = fract(vec3(gl_FragCoord.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  c += (fract((p3.x + p3.y) * p3.z) - .5) / 255.;
  fragColor = vec4(c, 1.);
}`;
