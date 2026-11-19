// Tone mapping and the bakery's light, shared by the scene and the crumbs (the motes need KEY_DIR).
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }
vec3 display(vec3 c) { return pow(aces(c * .72), vec3(1. / 2.2)); }
const vec3 KEY_DIR = vec3(-.4497, .7995, .3997);
vec3 keyLight(float heat) { return vec3(1., .94, .84) * 1.75 * mix(1., .25, heat); }
vec3 skyLight(float up, float heat) { return mix(vec3(.2, .15, .11), vec3(.42, .5, .62), up * .5 + .5) * .6 * mix(1., .45, heat); }
