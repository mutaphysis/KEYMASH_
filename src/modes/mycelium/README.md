# MYCELIUM_ — the forest floor

[← back to the README](../../../README.md) · [← COOKIE_](../cookie/README.md)

MYCELIUM_ is the forest floor seen from the side, drawn from photographs: moss on top, the soil below it,
cut open like a trench wall. It is under construction: there is no language yet, and no mycelium.

## What the text does (so far)

The whole text seeds the ground. The same text always gives the same ground; any text is a valid one.

- **The curve of the floor**: three swells (long to short) and four mounds or hollows, their sizes, places and
  phases read from the text.
- **The soil horizons**: how deep the leafy humus reaches, where the dark humus turns plain and the plain turns stony.
- **The moss's thickness** along the floor: two waves, from 0.6 to 1.45 times the photographed moss.
- **Where the borders wander**: the noise that bends horizon borders and tones the soil is read at a place of the text's own.
- **The mossy hill behind**: rounded moss cushions, about six big ones in 10 m (one per 650 view units, a little
  jittered), each a lopsided elliptic dome whose top stands about 80 units (21 cm) over the floor under it, about
  0.8 m wide; between every two a smaller one (0.35–0.55 m, 20–50 units over the floor), so the hill never runs
  flat. Where cushions meet they nestle with a soft crease (a smooth maximum, not a sum: no dips on top). Together
  they show over the floor along about three quarters of it.
- **What lies buried**: 6–9 treasures, each a different one off the library's treasure and crystals sheets, every piece
  as likely as any other (a chest of coins, pots, an amphora, a sword, a helmet, a crown, a lantern…; raw gems: an
  amethyst geode, a ruby, an emerald, quartz, opal, lapis…, so about half the finds are gems), well apart, shallow
  ones likelier so a few show from where the camera starts; and about 150 bare stones and pebbles (the library's
  stones without moss or lichen, its soil pebbles), sparse in the humus and gathering in the stony horizon. All at
  their library sizes (a pebble 4 cm, a stone up to 15 cm, a gem 4–15 cm, the chest 70 cm), a little larger or
  smaller, turned a little, mirrored half the time. None overlaps another, none reaches up closer than 40 cm under
  the floor (below the moss), none leaves the world. They sit at a depth below the floor, so they ride along when an
  edit eases the floor; the things themselves are swapped for the new text's at once. Now and then a gem glints: a
  short twinkle on a bright spot of it, a few seconds apart and most chances skipped (none with reduced motion).
- **The tree's crown**: six canopy pieces stacked over the top of the trunk, back to front: one wide piece furthest
  back (3.8–4.6 m) and highest, two pairs further in, one in front and lowest. Only their undersides show (the view
  never goes above the trees), so they read as one crown with layered hanging edges. No crown is symmetric: it leans
  to one side (mirrored half the time), each piece is wider toward the lean, its underside rounder or flatter (a
  superellipse) and wobbling, its centre and height strayed, and one bough of the middle layer hangs lower. And the
  season its leaves are in: summer green about half the time, autumn (yellow through orange and red, patches a spray
  of leaves across ahead of or behind the rest) four times in ten, otherwise the dry brown that beeches keep through
  winter.

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
| ridge | a mossy hill behind the floor, same distance (no parallax), on its own waves: the moss band of a second strip (`tex-ground-c.webp`: star moss, lichen, clover) for its outline, a hex-tiled moss carpet (`tex-moss-*.webp`) for its body, a little darker | `ridge.vert`, `ridge.frag` with `strip.glsl`, `mossfill.glsl`, `crown.glsl` |
| ground | one mesh: per column the strip's top on the curve, its bottom along the curve's normal (blended with straight down, so steep bits don't fold), the bottom of the world | `ground.vert`, `ground.frag` with `strip.glsl`, `soil.glsl`, `crown.glsl` |
| tree | one tree (a beech trunk, `trees-a/03` from the library, 92 cm wide, 2.4 m of it) standing 140 units right of where the camera starts, drawn after the ground, its foot 45 units (12 cm) under the floor's curve, about 7 cm into the dense moss. Its mesh's foot rows bend with the floor under them. The ground is projected onto its foot in world space: the moss carpet climbs it (thick at the floor, in cushions, most on what faces up), and below the floor the ground strip takes over. Each hands over in a height blend rather than a cross-fade, the tree's height being its local relief (its depth against the depth around it): every texel is bark, moss or strip whole, the hollows between roots mossed first, so nothing ghosts. The same relief shades the hollows (moss down to 40 %, bark to 75 %). Its relief page (normal, depth) and the floor at any point (`groundat.glsl`: the ground mesh's columns as a float texture) feed it. Higher up it lies in the crown's shade, and inside the crown it shows only through the leaves' gaps, dark | `tree.vert`, `tree.frag` with `strip.glsl`, `mossfill.glsl`, `groundat.glsl`, `crown.glsl` |
| crown | the tree's crown (`crown.ts`), made like the floor upside down: per canopy piece a U (its underside a superellipse wider on one side, wobbling a little, its sides running straight up out of the world), the beech's canopy strip (`tex-canopy-beech.webp`) hanging along it in the ground strip's 1D Voronoi cells, its dense band inside the outline and its sprays out of it along the normal, and the beech's leaf fill (`tex-leaf-2.webp`) hex-tiled for the body, a fan from high above. Over the strip's dense band the fill takes over in a height blend along a wandering line, never below it (its edge would show through the gaps). Leaves are recoloured: the photograph's brightness mapped onto the season's shade, middle and light colours, so strip and fill match; twigs (not green in the photo) keep theirs, greyed. Faked shade, no shadow maps: further back is darker, deeper inside a piece darker, under another piece in its shade (a column below it that leans with the light from the upper left, blurring and fading with the distance), and behind one only seen through its leaves' gaps; the same shade falls on the trunk, the hill and the floor's moss. Clumps of leaves standing out of the crown catch the light wherever they hang, low down too (patches a few sprays across, their edges following the brighter leaves), and the hanging sprays a little | `crown.vert`, `crown.frag` with `strip.glsl`, `leaves.glsl`, `crown.glsl` |
| buried | treasure and stones: a quad each from the library's atlases (`atlas-underground-0`, `atlas-ground-0`), in four passes: a halo of damp, disturbed earth around each treasure in its own shape (its alpha tapped over a disc of 48 taps reaching about a third of its narrow side plus 4 cm, so a sword gets a long narrow halo and a pot a round one; ragged by noise, the soil's colour darkened rather than black, at 40 % strength in the light upper soil rising to full deep down, fading out before the moss), a soft shadow under each thing (its alpha at a fixed mip level, dropped 3 units), then the picture: stained toward the soil's colour, earth clinging in blotches, in the soil's shade and darker with depth like it (gems stained a quarter as much, a little less shaded, darkening half as much: their colour is the find), then the gems' glints (a four-pointed star on a bright texel of the gem, its rays growing and fading over half a second, and meanwhile the gem glows a little in its own colour, a third of it added, blurred so the light spreads a few texels past its edge, fading out a little after the star; added over the picture on the halo quads, which leave the rays room) | `buried.vert`, `buried.frag` |
| post | a gentle contrast curve, vignette, film grain | `post.frag` |

- **The strip** (`assets/tex-ground.webp`, moss over soil) is laid along the curve by arc length, 335 view units per
  strip width: about 0.65 mm per pixel, measured off its clover (2–3 cm, 35–49 px) and its oak and beech leaves
  (120 and 78 px), so the strip is about 38 cm tall, not the 60 cm ASSETS.md planned for strips. The world is 10 m
  wide. It isn't seamless, and a mirrored repeat shows a Rorschach axis every repeat, so `strip.glsl` cuts the
  curve into cells (a 1D Voronoi: jittered borders that also wander with depth). Each cell shows its own stretch of
  the strip, mirrored half the time, and neighbours meet in a height blend (`blend.glsl`): the taller tuft or the
  brighter leaf wins and stays whole.
- **Moss thickness**: the moss part of the strip (the picture's top 57 %) is stretched or squeezed per column of the
  mesh, the soil below it keeps its scale, so the strip grows and shrinks with its moss. Each vertex carries where
  the moss ends in its column; `ground.frag` maps v back onto the picture piecewise. The surface stays on the curve.
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
- **The hill behind**: per column its strip's moss band (the picture's top 38 %, never its soil) along its curve, and
  straight below that its body, down to 30 units under the floor's top, where the floor's moss hides it. The band
  hands over to the body's moss carpet in a height blend along a wandering line, like the floor's strip into its soil;
  the carpet is the four moss tiles hex-tiled like the soils, the tile per patch chosen by slow noise (clusters, not a
  checkerboard), its colour matched to the band's moss. Toward its foot it darkens, in the floor's shade. Its strip
  cells are seeded apart from the floor's (`uCellSeed`). Where it dips below the floor, the floor hides it all.
- Colours are premultiplied throughout; the bitmaps are decoded premultiplied, so mipmaps don't bleed transparent
  texels' colour into the moss edges.

## Debugging

In dev builds (`bun run dev`) a grid button sits left of fullscreen while the mode plays. It draws every draw's
edges over the picture in one colour per shader or material (sky, moss band, moss body, ground strip, ground soil,
tree, crown, treasure halos, buried things, post), with a legend of triangle counts in the top left. The full-screen
triangle of sky and post runs off screen, so only its legend line shows. Off, it costs nothing; on, about 9,300 line
segments in eight draws.

## Assets

`assets/` is the forest library as `scripts/forest/matte/pack.py` packs it (`scripts/forest/samples/pack`): atlases,
textures, `manifest.json`, `report.json`. It is copied as it is (`oxfmt` leaves it alone). Only what the scene uses is
bundled and fetched (`assets.ts`: two ground strips, four moss carpets and four soils, the two atlases of what lies
buried, the tree's page with its relief, and the beech's canopy strip and leaf fill, about 2.3 MB); the download
starts when the mode's code loads and shows its byte count on the boot screen. Trees come one per page, each with a
relief page beside it (normal, depth: see `scripts/forest/README.md`, step 15), so the scene fetches only the trees
it shows. The leaf cover (step 16) keeps its photographed colour; the crown replaces it by the season's.
