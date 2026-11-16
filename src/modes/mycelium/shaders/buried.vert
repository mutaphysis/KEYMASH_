// What lies buried: one quad per thing, turned and placed on the CPU (render.ts), padded past its picture so its
// soft shadow has room; a treasure's halo quad is padded by as far as the halo reaches. The shadow pass draws the
// things' quads a little lower.

layout(location = 0) in vec2 aPos;    // world
layout(location = 1) in vec2 aUV;     // in its atlas
layout(location = 2) in float aDepth; // view units below the forest floor
layout(location = 3) in vec4 aRect;   // the picture in its atlas: u0, v0, u1, v1
layout(location = 4) in float aReach; // how far the halo spreads the picture's outline (texels)

uniform vec2 uOffset; // world units the whole pass moves by: the shadow drops below the thing

out vec2 vWorld;
out vec2 vUV;
out float vDepth;
flat out vec4 vRect;
flat out float vReach;

void main() {
  vWorld = aPos;
  vUV = aUV;
  vDepth = aDepth;
  vRect = aRect;
  vReach = aReach;
  gl_Position = toClip(aPos + uOffset);
}
