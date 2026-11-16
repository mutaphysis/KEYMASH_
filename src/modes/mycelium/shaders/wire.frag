// Debug wireframe: one flat colour per shader or material, so you can tell which draw made which triangles.

uniform vec4 uColor; // straight colour and alpha

out vec4 o;

void main() {
  o = vec4(uColor.rgb * uColor.a, uColor.a);
}
