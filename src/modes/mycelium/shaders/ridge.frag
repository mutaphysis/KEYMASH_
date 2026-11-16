// The mossy hill behind the floor: the moss band of a second ground strip, in its own cells, a little darker for
// being further back. No soil: v stops where the picture's moss ends, and the band fades out toward there.

in vec2 vUV;

uniform float uMossEnd; // v in the picture where its moss ends
uniform float uShade;   // darker than the floor in front
uniform vec3 uTint;     // the key light

out vec4 o;

void main() {
  vec4 s = strip(vec2(vUV.x, vUV.y * uMossEnd));
  s *= 1.0 - smoothstep(0.78, 1.0, vUV.y);
  o = vec4(s.rgb * uTint * uShade, s.a);
}
