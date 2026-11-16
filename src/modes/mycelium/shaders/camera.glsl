// The camera: a window on the world, panned in x and y. No perspective: depth comes from layers.

uniform vec4 uCam; // centre x, y; half width, half height (view units)

vec4 toClip(vec2 world) {
  return vec4((world - uCam.xy) / uCam.zw, 0.0, 1.0);
}
