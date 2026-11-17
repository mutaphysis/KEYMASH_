// The air of the forest at a height: brighter and hazier toward the floor. The sky behind everything is made of it,
// and what stands further back fades toward it.

uniform vec3 uSkyHigh, uSkyLow; // the air high up, and at the floor

vec3 airAt(float y) {
  return mix(uSkyLow, uSkyHigh, smoothstep(-60.0, 420.0, y));
}
