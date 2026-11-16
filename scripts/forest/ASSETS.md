# FOREST_ asset guidelines

The rules every asset in the library follows, per type. `12-library.ts` encodes them (`TYPES`), the cut and the
packer check them, and the library viewer shows the result at true scale. An asset that breaks a rule is
re-rolled, dropped with a reason in the plan, or retired: never packed as it is.

Why rules: the first library was collected sheet by sheet and it showed. Stones 77 px next to a 900 px boulder,
trunks cut through by a grid, frogs and moths with legs we can't move, mushrooms where one species grows, one
decays onto a moss tuft that stays behind as a stain, and most do neither.

## Scale

**The focus plane is 3.75 view units per cm.** The view is 1280 × 720 units, so it shows several metres of forest:
about 3.4 × 1.9 m. Anchor: a mature fly agaric (about 20 cm) is at most 75 units tall, a tenth of the view height.
(A view unit is about a CSS pixel: the view is fitted to the window.)

- Things farther back are drawn smaller by their layer (depth factor d < 1), from the same sprite: blur and fog
  come from the shader, never from a second asset. Only the out-of-focus frame in front is drawn larger. So each type has a real size and a layer, and from both its **size: the longest side, in view
  units, at the largest it is ever drawn**.
- **Critters are drawn 5× larger than life**, or their legs and antennae would not read (an ant would be 4 units).
  A 3 cm ground beetle is 56 units, the snail about 90: the sizes the prototype's bugs already have.
- **Texel density**: 2 texels per view unit at that size for anything drawn sharp (1:1 on a 2560 px wide canvas),
  1 for things only ever drawn blurred. Longest side at most 2048 px. A mature fly agaric is packed at
  150 px, so 1K sheets are enough for everything but trees.
- The packer scales every frame to that. It never scales up: a source smaller than its size × density stays as it
  is and the report says which density it reached (re-roll at a higher resolution if it matters).
- The manifest carries each frame's **`s`, view units per texel**. Renderers draw a frame at `w·s × h·s`, never at
  its texel size, so atlas pixels and screen size can't drift apart.
- **One sheet, one scale.** A variety sheet is drawn "at one scale, true to their real sizes" and packed with one
  factor (tallest subject = the type's size, the rest keep their proportion). Where the model can't keep real
  sizes (an acorn as big as an oak leaf), the plan lists the size of each cell in cm.

## Every asset

- **Two looks, by type.** The world is **photographic** (macro, real textures). The living things that move and
  grow, **mushrooms and critters, are ink-and-wash illustrations**: fine pen outlines and hatching with loose
  transparent watercolour, like an old nature field guide. They stand out against the photographs, the way a
  player's eye should find them (step 13 compared gouache, ink and wash, cel, felt and pencil; ink and wash won).
  Nothing else is illustrated, and nothing in between (the old painted mushroom variety sheet is out).
  Illustrations stay out of the set grade, which would pull them toward the photographs' palette.
- **Neutral light**: soft even overcast daylight from above, no colour cast, no warm light. Nothing glows in the
  pixels: glow, haze and the colour of the air are runtime theme uniforms (README, step 11).
- **Plain flat light grey background.** No ground, no shadow, no panels, no grid lines, no captions.
- **Nothing under it.** Whatever stands on the ground ends at the bottom of its picture: no moss tuft, no soil clump,
  no ground strip. The join to the ground is made at runtime: the base sinks into the ground ribbon (the sprite
  shader's foot mask), and moss pieces are laid over seams. A tuft under one frame and not the next is how the
  amanita stain happened.
- **Side view at eye level.** Critters face left (the renderer flips).
- **Whole**: one subject per cell, nothing crossing the cell border except where its type says so (trunks leave the
  top, strips run off both sides). Never a fragment.
- **Wood is never sawn**: broken, snapped, splintered, rotten (README, step 9).
- **States come from the type**, not from the sheet. A type that has frames has them for every asset of the type;
  a static type has none.

## Types

| type | where | size (longest side) | density | states | may touch | atlas |
|---|---|---|---|---|---|---|
| `mushroom` | focus plane | per species, 10–30 cm (38–112 u) | 2 | **life**: 12 frames | – | mushrooms |
| `critter` | focus plane | per cell, real cm × 5 (15–95 u) | 2 | none: procedural | – | critters |
| `plant` | focus plane | sheet, tallest 30 cm (112 u) | 2 | none: shader sway | – | plants |
| `shrub` | middle layers | 50 cm (188 u) | 2 | none: shader sway | – | plants |
| `moss` | focus plane, over seams | sheet, widest 15 cm (56 u) | 2 | none | – | ground |
| `moss-strip` | along ground curves | 60 cm (225 u) | 2 | none | left, right | ground |
| `stone` | focus plane | sheet, largest 15 cm (56 u) | 2 | none | – | ground |
| `litter` | falls from above | per cell, 2–15 cm (8–56 u) | 2 | none: procedural fall | – | ground |
| `inclusion` | in the soil | per cell, 2–70 cm (8–262 u) | 2 | none | – | underground |
| `deadwood` | focus plane | per sequence, 80–100 cm (300–375 u) | 2 | **decay**: 4 frames | – | wood |
| `landmark` | behind the focus | per asset, 50–80 cm (188–300 u) | 2 | none | – | wood |
| `tree` | every depth layer | 900 u at the nearest layer (snags 450) | 2 | none | top | trees |
| `soil` | fill below the ribbon | tile | – | none (seamless) | all | texture |
| `moss-fill` | body of mossy hills behind the floor | tile, about 30 cm | – | none (seamless) | all | texture |
| `ribbon` | the ground curves | strip | – | none (mirrored repeat) | left, right | texture |

### mushroom: the life cycle

The heart of the mode: the mycelium raises them, nutrients make them glow, they die back. So every mushroom has the
whole cycle, and there are no static mushrooms: a decorative one is a life sequence held at its mature frame, so
anything on screen can still grow or die.

- **Ink and wash** (see Every asset).
- **One 4 × 3 sheet per species, 12 frames of the same individual** (one call, so it is the same mushroom growing
  and decaying): frames 1–8 grow (a pin breaking out, a button, the species' own unfolding, frame 8 mature), frames
  9–12 decay (wilting, sagging, collapsing, a small remnant). Manifest: `<species>.grow` = 1–8, `<species>.decay` =
  8–12. The remnant fades and sinks at runtime.
- Their size is their **height** (the frames widen as they collapse): a mature fly agaric 75 units at most.
- Same spot (bottom centre), same scale in every frame; the stem base ends at the bottom with nothing under it.
- 1K sheets: a mature fly agaric is packed at 150 px, a 4 × 3 sheet at 1K gives cells of about 290 px.
- No egg shells, no veil scraps lying around, no glow in the pixels (the ghost species is pale and translucent; the
  shader makes it glow).
- Species: fly agaric (20 cm), porcini (16), parasol (30), shaggy ink cap (16, decays into ink), pale bonnet cluster
  (12), ghost mushroom cluster (10).

### critter: bodies, the motion is procedural

Generated walk cycles don't read (README, step 2b); legs, antennae and gait are drawn procedurally, the snail crawls
by a shader wave. So the library holds only what that animation needs:

- **Ink and wash** (see Every asset).
- **Legless, antenna-less bodies**, exact side view, facing left: head, thorax, abdomen. Sized per cell, 5× real size (an ant
  is 1.2 cm → 22 units, a ground beetle 3 cm → 56).
- **The snail**: one sprite, body extended (on the first critter sheet). No crawl frames (they came out identical, the shader does it).
- The model draws legs anyway, about every second body, however the prompt says it ("WITHOUT ANY LEGS", "like a paper
  puppet"); asking for "one closed outline" underneath drew an arc under every body. Drop the legged cells (the plan
  keeps the reason) rather than re-rolling forever.
- **Not in the library** until there is a rig for them: anything with drawn legs (the critter variety sheet, the
  mossy beetle), wings (the moth, top view besides), frogs, and long bodies that bend (worms, slugs, centipedes need a
  segment chain).

### plant, shrub, moss, moss-strip

- Plants are rooted at the bottom of the picture, the stems ending there: no soil clump, no moss cushion (the grass
  sheet had both, half of them with a grey matte smear under it).
- Shrubs stand on the bottom edge, whole, wider than tall is fine.
- Moss pieces are the joiners: cushions, mats and hanging moss laid over seams, so they are the one thing that may be
  flat at the bottom. Strips run the full width (both sides may touch), one per row with empty grey between rows.
- All static; the shader sways plants and shrubs.

### stone, litter, inclusion

- Stones: one sheet at one scale, from pebbles to a 15 cm stone. The old boulder is a stone too, at 15 cm (56 units,
  112 px): packed at 900 px it was four times the largest stone.
- Litter: what falls from the trees (leaves, cones, nuts, seeds, twigs), each alone; sized per cell. Falling,
  fluttering, spinning and bouncing are procedural.
- Inclusions: what is buried in the soil for the mycelium to wind around, sized per cell: stones, roots and
  seeds, and the secrets (a treasure sheet: a chest, coins, pots, a broken sword, a crown…; a remains sheet: skulls,
  bones, an antler, fossils, amber). Photographs, dirty and weathered, with bits of earth on them (they are in it).
  Treasure is sized in storybook proportions, not museum ones: the chest is the prize (70 cm), pots, the helmet, the
  bottle and the lantern are big enough to read (30–45 cm), the broken sword is a blade, not a landmark (35 cm).

### deadwood and landmark

- **Deadwood** decays and feeds the mycelium: a broken trunk (80 cm) and a fallen branch (100 cm), **4 frames per piece** (intact, bark peeling with fungi, split and
  crumbling, a low heap of rotten bits), one piece per row, same spot and scale, nothing under it.
- **Landmarks** are static set pieces just behind the focus plane: the stump of splinters, the root arch, the log
  with its root plate. They don't decay (they outlast a session).

### tree: one set for every depth

- **There are no background trees and foreground trees: one set of trees, drawn in every layer.** A far layer
  draws the same sprite smaller, blurred (mip bias) and fogged; a near layer draws it sharp. So a tree is made for
  the nearest layer (900 units, 2 texels per unit: 1800 px) and the mips give the far ones for free.
- Whole trees (crown to roots), trunks leaving the top (the one edge they may touch), and snapped dead snags are all
  `tree`. Snags are snapped off, so half the size of a tree that leaves the top (450 units). Generated two per 4K sheet, with a wide gap so their roots don't touch (the grid cut through the roots of
  trunks that did).
- No low-resolution duplicates: the prototype's old 4-trunk strip is retired (cut through by the grid, and the 4K
  trunks replace it).

### soil, ribbon

Textures, not sprites. **No roots in either: tree roots are procedural**, like the mycelium, so they can grow
toward the trees that are actually there.

- The ground strips (the ribbon the ground curves are made of) repeat mirrored along the curves. Three versions,
  all on **one soil** (dark crumbly humus with small stones and bits of leaf litter): bumpy moss cushions (the
  prototype's look; its step-6 strip had roots and a warm glow and is retired), a leafy one, one with star moss
  and lichen.
- Strips are cut by colour, not by a matting model (`matte.py ribbon`): InSPyReNet and BiRefNet see a strip that
  fills the frame edge to edge down to the bottom as background and return an empty mask. The grey above is flat
  and known, so alpha is the distance from it, kept where it connects to the bottom, holes filled.
- The soil textures are seamless tiles of that same soil, four variants (plain, stonier, darker, with buried
  leaves), so the fill below the ribbon continues the strip's soil band.
- The moss carpets (`mosses`, type `moss-fill`) are seamless tiles of a moss-covered slope seen from the front, four
  variants (star moss, feather moss with lichen, darker shade moss, moss with clover), about 30 cm per tile. They fill
  the body of mossy hills below a strip's moss band; packed as `tex-moss-<n>` (textures are named by their type).

## Checks

The pipeline checks what a machine can see; the eye does the rest.

- **`cut`** (rejected): the subject touches the top, left or right of its cell where its type doesn't allow it, over
  more than 3 % of that side. That is a subject crossing the grid (the broken trunks and the half tree). The bottom
  is never checked: everything that stands touches it.
- **`fragment`** (rejected): a cell under 10 % of the sheet's median area (outside sequences): a speck, a sliver.
- **`base`** (warned): a type that stands on nothing has a wide bottom row (the bottom 4 % of the subject is wider
  than 70 % of its widest row): a tuft or clump was drawn under it. Re-roll.
- **`count`** (warned): fewer or more cells than the grid asked for.
- **`density`** (warned): the source is smaller than size × density.
- **`drop`** (in the plan, with a reason): what the eye catches. Kept in the plan so the reason stays.

`pack.py` prints the report and writes it to `report.json`; rejected cells never reach an atlas.

## Review

`bun scripts/forest/proto.ts --library` shows every group **at true scale** on a ground line, with a 10 cm ruler
and the mature fly agaric for comparison, sequences playing. Look at it after every change to the library.
