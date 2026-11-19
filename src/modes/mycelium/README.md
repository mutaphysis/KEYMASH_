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
- **The trees**: 5–8 trunks across the whole world, one per equal stretch of it, jittered within it (about 1.25–2 m
  apart), from fourteen library trunks (`trees-a/03`, a stout beech; four slender ones made one per sheet: a beech with
  eye-shaped scars, a twisting hornbeam, a furrowed oak with a burl, a forked beech; and nine made five per sheet: an
  S-curved young beech, a sweet chestnut, a fluted hornbeam, a flaking sycamore, an ash, a lime with burrs, a banded
  red cherry, an alder, a wounded beech with bracket fungi). No picture repeats within seven trees in
  a row. Each differs from its picture a little: mirrored half the time, leaning up to 2.6°
  either way, 10 % larger or smaller, stretched 5–45 % taller than its picture (at its picture's proportions every
  crown hung at about the same, low height; the bark's furrows run upward, so it still reads as bark), its bark
  lighter or darker (±12 %), warmer or greyer, more or less saturated,
  broken by damp and dry patches of its own, its moss climbing higher or lower in cushions of its own. Every other
  tree stands further back (the first in front or behind, by the text): up to 16 % smaller, fading up to 30 % into
  the air, and drawn whole, trunk and crown, before the trees in front of it, so where two crowns meet the nearer one
  covers the further.
- **The canopy**: six canopy pieces over each trunk's top, back to front: a wide one furthest back and highest
  (4.6–5.5 m across, reaching well over the neighbours', so the canopy closes over the forest; at either end of the
  world it reaches past the edge, so no sky shows beside the last crown), two in a middle layer either side, two
  lower ones, one in front, lowest. Every crown has the same size whatever its trunk's (shrunk with a tree further
  back, the crowns turned to lollipops). About half the crowns also hang a lobe low in the gap toward a neighbour
  (0.8–1.35 m under the trunk's top, at least 1.5 m wide: narrower, its underside curved so tightly that the strip
  smeared), so the canopy isn't all above the trunks. Only the undersides show (the view never goes above the
  trees), so they read as layered hanging edges. Each tree's pieces sit higher or lower on its trunk (10 cm lower to
  22 cm higher), the lower ones always low enough to hide the trunk's cut top. In seven crowns of ten the trunk rises
  in front of one of the two lower pieces and behind the other, so some of its leaves hang behind it and some in
  front, as on a real tree, instead of the crown sitting on it like a lid (the pieces higher up and the lobe are
  behind it in every crown). No crown is symmetric: it leans to one
  side, each piece is wider toward the lean, its underside rounder or flatter (a superellipse) and wobbling, its
  centre and height strayed, and one of the lower boughs hangs lower still. Each tree wears its own kind of leaves
  (birch, oak, beech or maple, never its left neighbour's) in a shade of its own (lighter or darker, warmer or cooler,
  greener or greyer, a few per cent). The season is the forest's: summer green about half the time, autumn four times
  in ten, otherwise the dry leaves of winter. Each kind turns its own way (birch yellow to gold, oak olive to russet,
  beech yellow-orange to copper, maple orange to red; in winter pale ochre, brown, copper-tan, reddish brown) and at
  its own time (birch and maple early, oak late), and each tree a little earlier or later than its kind: in autumn a
  green tree may stand beside a red one, in summer and winter they differ only a little. Within a crown, patches a
  spray of leaves across run a little ahead of or behind the rest.

Editing while it runs eases the old ground into the new one (about half a second; at once with reduced motion);
what lies buried, the trees and the canopy are swapped for the new text's halfway through, once the new forest's
trunks are downloaded.

**Note:** a different text doesn't need a smooth transition to its ground. Later the forest will drop away and be
recreated for the new text, so there is no need to make changes between texts smooth now (the easing above is a
stopgap, and seeding texture details by the text is fine even where it jumps).

Drag (or scroll) to look around, the camera moves left, right, up and down; pinch (or ctrl + scroll, a trackpad pinch)
zooms between twice as far and four times as close.

## How it is drawn

WebGL2 on its own canvas, in 2D: a camera panned over the world, no perspective. Depth comes from layers.
Each frame draws into a target sized by the pixel budget (`src/ui/budget.ts`), then onto the canvas. The layers'
order, back to front, is also each draw's depth (one slot per layer, trunk and canopy piece, set through the depth
range; every vertex shader puts z at 0). The canopy goes first, all opaque, front to back, writing depth: each
piece's mesh is cut where `crown.frag` would turn translucent (`CROWN_OPAQUE` of the strip's dense band,
`crown.ts`) into its body (the fan and the inner band of its ribbon), drawn first, and its fringe of hanging
leaves, cut out (a texel at least half covered whole, the rest dropped) rather than blended. So each pixel is shaded
by the nearest leaves only; everything else follows back to front as listed, tested against that depth, the trunks
blended between their crowns' pieces. The canopy's shade comes from the shade map, baked once per forest. Before,
the canopy shaded each pixel up to 20 times, each looping over every piece (`bun scripts/perf.ts` measures this).

| layer | what | shaders |
| --- | --- | --- |
| sky | the air behind everything (`air.glsl`): haze toward the floor, a soft light, slow mist; a placeholder until the backdrop comes | `screen.vert`, `sky.frag` with `air.glsl` |
| ridge | a mossy hill behind the floor, same distance (no parallax), on its own waves: the moss band of a second strip (`tex-ground-c.webp`: star moss, lichen, clover) for its outline, a hex-tiled moss carpet (`tex-moss-*.webp`) for its body, a little darker | `ridge.vert`, `ridge.frag` with `strip.glsl`, `mossfill.glsl`, `shademap.glsl` |
| ground | one mesh: per column the strip's top on the curve, its bottom along the curve's normal (blended with straight down, so steep bits don't fold), the bottom of the world | `ground.vert`, `ground.frag` with `strip.glsl`, `soil.glsl`, `shademap.glsl` |
| trees | the row of trees (`trees.ts`), tree by tree from the back, each drawn between its crown's pieces: those behind it, the trunk, then the rest; drawn 20 % larger than their library size (one looked small beside the moss and the hill: 2.9 m of trunk; crowns grow with them, though not with a tree's own size, and the leaves don't) and stretched taller, after the ground, each foot 45 units (12 cm) under the floor's curve, about 7 cm into the dense moss, mirrored and leaning by a shear (the foot stays on the floor). Its mesh's foot rows bend with the floor under them. The ground is projected onto each foot in world space: the moss carpet climbs it (thick at the floor, in cushions, most on what faces up), and below the floor the ground strip takes over. Each hands over in a height blend rather than a cross-fade, the tree's height being its local relief (its depth against the depth around it): every texel is bark, moss or strip whole, the hollows between roots mossed first, so nothing ghosts. The same relief shades the hollows (moss down to 40 %, bark to 75 %). Its relief page (normal, depth) and the floor at any point (`groundat.glsl`: the ground mesh's columns as a float texture) feed it. Per tree: its bark's gain and saturation, patches taller than wide (±14 %) and its own place in the noise for moss and patches, its moss climbing 0.7–1.35× as high. Higher up the trunks lie in the canopy's shade, and behind the pieces of their crown drawn after them and the crowns of the trees in front they show only through the leaves' gaps, dark (both from the shade map). A tree further back fades into the air (`air.glsl`, the sky's colour at that height), the fade gone by the floor so its foot matches the ground around it. The world reaches 4.5 m up (1700 units), a little into the tallest trees' canopy | `tree.vert`, `tree.frag` with `air.glsl`, `strip.glsl`, `mossfill.glsl`, `groundat.glsl`, `shademap.glsl` |
| crown | each tree's crown (`crown.ts`), its pieces at their places in painter's order around its trunk (the pieces marked `behind` before it), made like the floor upside down, two draws per piece, all opaque and front to back (bodies first, then fringes): per canopy piece a U (its underside a superellipse wider on one side, wobbling a little, its sides running straight up out of the world), in its tree's kind of leaves: that kind's canopy strip (`tex-canopy-<kind>.webp`) hanging along it in the ground strip's 1D Voronoi cells, its dense band inside the outline and its sprays out of it along the outline's normal (blended toward straight down, the ribbon sheared on the steep sides and tilted their leaves), and that kind's leaf fill (`tex-leaf-<n>.webp`) hex-tiled for the body, a fan from high above. The fringe of hanging leaves is cut out, not blended: a texel at least half covered is drawn whole, the rest dropped. Leaves are drawn at 70 % of the size the library measured (they looked too large beside the trunks). Over the strip's dense band the fill takes over in a height blend along a wandering line, never below it (its edge would show through the gaps). Leaves are recoloured: the photograph's brightness mapped onto the shade, middle and light colours of the tree's season in its kind's colours, so strip and fill match, then the tree's own shade of it; twigs (not green in the photo) keep theirs, greyed. Faked shade from the pieces' shapes: further back is darker, deeper inside a piece darker, under another piece of its own crown in its shade (a column below it that leans with the light from the upper left, blurring and fading with the distance; another tree's crown casts none on it, its columns cut the crowns behind into dark and lit bands), and behind any piece drawn after it only seen through its leaves' gaps; every piece's shade falls on the trunks, the hill and the floor's moss. That shade is baked once per forest into the shade map (`shade.frag` over the whole world, 16 units a texel: a layer for the floor, one per trunk, one per piece, red the column shade, green the occlusion) and read with one lookup, instead of every pixel looping over every piece. Clumps of leaves standing out of the canopy catch the light wherever they hang, low down too (patches a few sprays across, their edges following the brighter leaves), and the hanging sprays a little. A crown further back fades into the air like its trunk | `crown.vert`, `crown.frag` (and with `CUTOUT` for the fringe) with `air.glsl`, `strip.glsl`, `leaves.glsl`, `crown.glsl`, `shademap.glsl`; `screen.vert`, `shade.frag` with `crown.glsl` bake the shade map |
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
trees, canopy, treasure halos, buried things, post), with a legend of triangle counts in the top left. The full-screen
triangle of sky and post runs off screen, so only its legend line shows. Off, it costs nothing; on, up to about
21,000 line segments (eight trees, 56 canopy pieces) in ten draws.

## Assets

`assets/` is the forest library as `scripts/forest/matte/pack.py` packs it (`scripts/forest/samples/pack`): atlases,
textures, `manifest.json`, `report.json`. It is copied as it is (`oxfmt` leaves it alone). Only what the scene uses is
bundled and fetched (`assets.ts`: two ground strips, four moss carpets and four soils, the two atlases of what lies
buried, and the four kinds of leaves' canopy strips and leaf fills, about 3.4 MB); the download starts when the mode's
code loads and shows its byte count on the boot screen. Trees come one per page, each with a relief page beside it
(normal, depth: see `scripts/forest/README.md`, step 15), so a forest fetches only its own trunks (about 0.3 MB each,
1.5–2.4 MB for 5–8 different ones), at RUN with the rest's byte count, and an edit's new trunks before it eases in.
The leaf cover (step 16) keeps its photographed colour; the canopy replaces it by the season's.
