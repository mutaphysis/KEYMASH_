// The scene target stretched over the canvas: heat haze while the oven is on, a tilt-shift blur above
// and below the band the cookies sit in, a soft vignette and a little dither against banding.

precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform vec2 uFocus; // the band that stays sharp: lower and upper edge, 0 bottom .. 1 top
uniform float uHeat, uTime;
out vec4 fragColor;
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + 1.), f.x), f.y);
}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  if (uHeat > 0.) {
    // hot air: ripples rising up the screen, sideways more than up and down, stronger higher up where the heat goes
    vec2 q = vec2(uv.x * uRes.x / uRes.y * 6., uv.y * 9. - uTime * 2.2);
    vec2 w = vec2(vnoise(q), vnoise(q * 1.7 + 17.3)) - .5;
    w += .5 * (vec2(vnoise(q * 2.3 + 5.), vnoise(q * 2.9 + 31.)) - .5);
    uv += w * uHeat * (.4 + .6 * uv.y) * vec2(.02, .01);
  }
  // tilt-shift: a disc of taps on a golden-angle spiral, turned per pixel, wider the further from the band
  float blur = smoothstep(0., .3, max(uFocus.x - uv.y, uv.y - uFocus.y));
  vec3 c;
  if (blur > .01) {
    vec2 r = blur * .018 * vec2(uRes.y / uRes.x, 1.);
    float turn = hash(gl_FragCoord.xy) * 6.2832;
    c = vec3(0.);
    for (int i = 0; i < 16; i++) {
      float a = float(i) * 2.39996 + turn;
      c += texture(uTex, uv + r * sqrt((float(i) + .5) / 16.) * vec2(cos(a), sin(a))).rgb;
    }
    c /= 16.;
  } else c = texture(uTex, uv).rgb;
  vec2 v = gl_FragCoord.xy / uRes - .5;
  c *= 1. - .3 * smoothstep(.3, 1., dot(v, v) * 2.);
  c += (hash(gl_FragCoord.xy + 7.) - .5) / 255.;
  fragColor = vec4(c, 1.);
}
