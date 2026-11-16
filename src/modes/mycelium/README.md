# MYCELIUM_ — the forest floor

[← back to the README](../../../README.md) · [← COOKIE_](../cookie/README.md)

MYCELIUM_ is the forest floor seen from the side, drawn from photographs: moss on top, the soil below it,
cut open like a trench wall. It is under construction: there is no language yet, and no mycelium.

## What the text does (so far)

The whole text seeds the ground. The same text always gives the same ground; any text is a valid one.

- **The curve of the floor**: three swells (long to short) and four mounds or hollows, their sizes, places and
  phases read from the text.
- **The soil horizons**: how deep the leafy humus reaches, where the dark humus turns plain and the plain turns stony.
- **Where the borders wander**: the noise that bends horizon borders and tones the soil is read at a place of the text's own.

Editing while it runs eases the old ground into the new one (about half a second; at once with reduced motion).

**Note:** a different text doesn't need a smooth transition to its ground. Later the forest will drop away and be
recreated for the new text, so there is no need to make changes between texts smooth now (the easing above is a
stopgap, and seeding texture details by the text is fine even where it jumps).

Drag (or scroll) to look around, the camera moves left, right, up and down; pinch (or ctrl + scroll, a trackpad pinch)
zooms between twice as far and four times as close.

## How it is drawn

WebGL2 on its own canvas, in 2D: a camera panned over the world, no perspective. Depth will come from layers.
Each frame draws into a target sized by the pixel budget (`src/ui/budget.ts`), then onto the canvas.

| layer | what | shaders |
| --- | --- | --- |
| sky | the air behind everything: haze toward the floor, a soft light, slow mist; a placeholder until the backdrop comes | `screen.vert`, `sky.frag` |
| ground | one mesh: per column the strip's top on the curve, its bottom along the curve's normal (blended with straight down, so steep bits don't fold), the bottom of the world | `ground.vert`, `ground.frag` with `strip.glsl`, `soil.glsl` |
| post | a gentle contrast curve, vignette, film grain | `post.frag` |

- **The strip** (`assets/tex-ground.webp`, moss over soil) is laid along the curve by arc length, 520 view units per
  strip width. It isn't seamless, and a mirrored repeat shows a Rorschach axis every repeat, so `strip.glsl` cuts the
  curve into cells (a 1D Voronoi: jittered borders that also wander with depth). Each cell shows its own stretch of
  the strip, mirrored half the time, and neighbours meet in a height blend (`blend.glsl`): the taller tuft or the
  brighter leaf wins and stays whole.
- **The soil** (`soil.glsl`) is the library's four soil textures as one texture array, hex-tiled (Mikkelsen's
  luminance-weighted blend, `hex.glsl`; research in `scripts/forest/README.md`, step 14). Each hex vertex picks its
  horizon by its own depth, bent by noise at two scales (broad swells, narrower tongues), so borders rise and dip
  instead of following the floor, and interlock patch by patch. Pockets (noise blobs a few patches across) take a
  horizon from above or below: gravel in the humus, humus washed down into the gravel. Offsets and left-right
  mirroring only: the soil is lit from above. Deeper, it darkens.
- **Strip into soil**: toward the strip's bottom its soil hands over to the horizons in a height blend: pebbles and
  crumbs of the strip stand out of the soil below, its dark gaps fill with soil first. The line rises and dips over
  long stretches and frays into blotches up close, so the strip's gravel band changes thickness and never ends along
  a ruled line. The soil's colour is matched to the strip over the hand-over band (geometric means, so bright pebbles
  don't count).
- Colours are premultiplied throughout; the bitmaps are decoded premultiplied, so mipmaps don't bleed transparent
  texels' colour into the moss edges.

## Assets

`assets/` is the forest library as `scripts/forest/matte/pack.py` packs it (`scripts/forest/samples/pack`): atlases,
textures, `manifest.json`, `report.json`. It is copied as it is (`oxfmt` leaves it alone). Only what the scene uses is
bundled and fetched (`assets.ts`: the ground strip and the four soils, about 650 kB); the download starts when the
mode's code loads and shows its byte count on the boot screen.
