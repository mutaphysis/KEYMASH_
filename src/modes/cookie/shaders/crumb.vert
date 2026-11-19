// Crumbs: per instance position, radius, colour, seed. uShadow = 1 draws their blob shadows on the tray.

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
}
