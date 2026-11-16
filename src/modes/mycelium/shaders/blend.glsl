// Height blend: two surfaces meet, and where they mix the higher one wins, so pebbles, leaves and tufts stay whole
// instead of fading into each other. `t` is b's share by position (0 … 1), `ha`/`hb` their heights (0 … 1), `sharp`
// how wide the mixed edge is. Returns b's weight.

float heightMix(float ha, float hb, float t, float sharp) {
  float wa = 1.0 - t + ha, wb = t + hb;
  float m = max(wa, wb) - sharp;
  float ba = max(wa - m, 0.0), bb = max(wb - m, 0.0);
  return bb / (ba + bb);
}
