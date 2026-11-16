# FOREST_ look research

A spike for a planned mode: the program runs as a mushroom forest (mycelium grows, mushrooms pop out of
the moss, snails and beetles crawl), drawn Samorost-like from many stacked, AI-generated photographic layers
with the simulation (nutrient flow and so on) on top. Question: can we generate assets in that look —
mossy, photorealistic, slightly surreal — cut them out, and animate them, cheaply and repeatably?

**Answer: yes for stills and cut-outs, no for AI animation. Animate procedurally.** The composite prototype
(`proto/`) gets close to the look with about 35 generated pictures. It cost $3.82 (estimated) of a $5.40 budget.
Cut-outs, grading and atmosphere are done locally, for free.

## Running

Generated pictures and clips stay out of git, in `samples/` (gitignored, about 400 MB). The scripts rebuild them;
each paid call is cached by its input, so running a step again costs nothing.

```sh
# token: REPLICATE_API_TOKEN=r8_… (or the bare token) in .env.local at the repo root
bun scripts/forest/1-style.ts              # 4 prompts × 4 models, contact sheets
bun scripts/forest/2-assets.ts samples/reference.webp   # style-locked asset set (the reference picture as style input)
bun scripts/forest/2b-sheets.ts            # sprite sheets: walk/crawl/grow cycles, 16 mushrooms, 12 critters per call
bun scripts/forest/3-cutout.ts             # background removal, sheet slicing, animated previews
bun scripts/forest/4-layers.ts             # qwen-image-layered on a finished scene
bun scripts/forest/5-video.ts              # image-to-video tries (dead end, kept for the record)
bun scripts/forest/5b-motion.ts
bun scripts/forest/6-kit.ts                # ground strip, trunk atlas, legless side-view bodies
bun scripts/forest/9-broken.ts             # snags, stump, log, tall trunks: broken off, never sawn
bun scripts/forest/10-cut.ts [--model inspyrenet|birefnet|vision] [--grade]   # local cut-outs of everything the prototype uses
bun scripts/forest/12-library.ts [--only a,b] [--regen a,b] [--recut a,b|all]   # the asset library (rules: ASSETS.md) → cells, graded, plan.json
uv run scripts/forest/matte/pack.py samples/12-library samples/pack [--ts <manifest.ts>]   # checks, sizes, atlases + manifest + report
bun scripts/forest/proto.ts --library      # stills of every page of the library viewer (proto/library.html)
bun scripts/forest/proto.ts --tiling       # soil anti-tiling techniques side by side (proto/tiling.html) → samples/14-tiling/
bun scripts/forest/13-styles.ts            # illustrated mushrooms and critters in five styles, composited into a prototype still
uv run scripts/forest/matte/matte.py compare samples/8-matte <raw.png>...      # matting models side by side, edges zoomed
bun scripts/forest/proto.ts                # captures the prototype into samples/7-proto/ (PARAMS="theme=night&graded")
bun scripts/forest/proto.ts --serve        # http://localhost:5180/proto/ (keys 1–4 = atmospheres, mouse = parallax,
                                           # ?theme=amber|moss|dusk|night, ?graded, ?hide=far,mid,back,snags,ridge,near,front)
```

`matte/` is Python because the matting models are: `matte.py` declares its dependencies inline, and `uv run`
installs them into a cached environment on first use (nothing global). `vision.swift` is compiled once by it.

- `replicate.ts`: the client. It runs official models by name and community models by their latest version,
  keeps a ledger with estimated prices, refuses a call that would pass `BUDGET` ($5.00), and retries
  on Replicate's burst limit (5 at a time while the account holds under $10).
  Replicate shows no prices to the API, so `PRICE` holds guesses read off the model pages, rounded up.
  Check the dashboard for the real bill.
- `contact.ts`: labelled contact sheets (Chromium screenshot → `cwebp`), with a checkerboard behind cut-outs.
- `slice.ts`: cuts an RGBA sprite sheet into cells at the empty gutters, whatever grid the model drew.
  It drops rows of name labels and specks, and puts every frame in one cell size with the subject at the bottom centre, so
  animation frames don't jump.

## What we learned

### Models (step 1, 2)

| model | look | isolation on flat grey | small/simple subjects | speed | ≈ $/image |
|---|---|---|---|---|---|
| google/nano-banana-2 | closest to the reference, takes surreal hints (moss growing on a beetle) | good | **best**: stays photographic | 10 s | 0.08 |
| bytedance/seedream-5-lite | clean, slightly surreal, most "product shot" | **best**, but adds a glow halo unless told not to | drifts into flat clip-art | 40–60 s | 0.035 |
| bytedance/seedream-4.5 | soft, cinematic | poor (keeps scenery) | – | 10 s | 0.04 |
| black-forest-labs/flux-2-pro | diorama-like | ok | – | 8 s | 0.05 |

- Use **nano-banana-2 for anything small or in sheets**, and seedream-5-lite for cheap large single assets.
- A reference picture as `image_input` carries palette and texture well. Treat it as mood only: models copy its
  composition flaws too.
- Prompt lessons:
  - A style line that says "everything overgrown with moss" puts a mossy ground under every asset. Describe the
    subject's surface instead, and state the isolation twice ("plain flat even light grey background, no ground, no other objects").
  - "Without legs" alone gives top-down views. Say the camera angle twice ("lateral view … seen from the side, not from above").
  - Models write name labels under sheet cells despite "no text". The slicer drops them.
  - Sheets don't keep the grid you ask for (4×2 can come back as 4×3). Slice by gutters, not by the requested grid.

### Sprite sheets (step 2b): the most useful find

- **Variety sheets** give 16 mushrooms or 12 critters for one call ($0.08), consistent in light and style.
- **Growth sheets** (egg → open toadstool in 8 frames) work in both models. The frames line up after slicing and drive
  the "pop out" animation directly.
- **Walk cycles don't**: the frames are nearly identical and the legs barely change. A snail stretch/contract works a bit.
- Seedream's own image series (`sequential_image_generation`) drifted in size and took 4½ min. Not useful.

### Cut-out (step 3, 8, 10): the grey rim, and matting on the Mac

- `851-labs/background-remover` (about $0.001 per picture) leaves a **light grey rim**. It keeps the source colour
  in the edge pixels, so a half-transparent moss tip still carries half the grey studio background, and compositing
  adds the grey a second time. A better mask alone doesn't fix that.
- **Fix: decontaminate.** We generate every asset on a flat background, so we know it, and can take it out of
  each edge pixel exactly: `F = (C − (1 − α)·B) / α`. B is estimated locally (a normalised blur of the clear
  pixels), which also handles seedream's glow halo behind subjects. A faint veil below α 0.04 is dropped.
  This cleans even the Replicate cut-outs; every local model below uses it.
- Local matting on an M4 (`matte/matte.py compare`, edges zoomed over dark soil and warm haze):

  | model | how it runs | per image | edges | catch |
  |---|---|---|---|---|
  | Apple Vision foreground mask (`vision.swift`) | Neural Engine, built into macOS, no download | 0.4 s | soft, low-res mask: blurry glow on fine detail | **drops non-salient subjects** (a birch in a row of trunks, the small first growth frames) |
  | BiRefNet general (rembg, ONNX) | CPU | 8.4 s | crisp, cleanest on antennae | onnxruntime's CoreML provider splits it into dozens of partitions and was still compiling after 12 min: use CPU |
  | **InSPyReNet** (`transparent-background`) | **PyTorch on MPS** | **2 s** (55 s first load) | crisp, about as good as BiRefNet | – |

  Default: InSPyReNet on MPS + decontamination. Vision for quick previews only.

### Wood is broken, never sawn (step 9)

- Unprompted, models give tidy sawn stumps and logs with flat cut ends: a park, not a wild forest. One line in every
  prompt fixes it: *"Wood is never sawn or cut: every top and every end is snapped, broken off, splintered, jagged,
  rotten and weathered…"*. It gives splintered snags, a stump of jagged spikes, and a log with a torn-up root plate.
- For sheets of trunks, ask for "wide empty gaps between them, the roots of neighbours do not touch", or they
  merge at the roots and can't be sliced.

### Colour: neutral assets, the mood at runtime (step 10, 11)

- The air's colour will change in the game (green, purple, blue…), so the assets must not carry one.
  **The atmosphere is shader uniforms** (`Theme` in `proto/gl.ts`): sky near and away from the light, fog, a key-light
  tint multiplied onto every sprite and ribbon, rays, soil, mycelium threads and glow. Themes ease into each other
  over a couple of seconds. The prototype has amber, moss, dusk and night (keys 1–4).
- Offline grading (`matte.py grade set`) only *aligns* and *neutralises*. It moves each asset's Lab spread and mean
  halfway to the set's mean, then removes the cast the whole set shares. The cast is read from the near-grey pixels
  of all assets (bark, lichen, stone), and the same amount comes off every asset. Earlier tries failed in ways
  worth knowing:
  pulling everything toward one asset turns a grey rock orange, and pulling each asset to a neutral mean overshoots
  low-chroma assets (cream bonnets turn blue).
- The grading's effect is small: under the night theme the foreground still reads warm, because the amber light
  is baked into the pixels as shading, not as a cast. **Generate assets in neutral light**: drop "warm amber
  tones" from asset prompts, use "soft even overcast daylight". Keep the amber for the runtime theme.

### Layers (step 4)

- `qwen/qwen-image-layered` ($0.05) gives an inpainted clean background plate and can pull a single animal out of a
  finished scene. Its middle layers are blurry mush, though. Building depth from separate assets is better.

### Animation (step 5): video is not worth it

- `wan-2.2-i2v-fast` (480p, ~30 s, ~$0.10) with the same first and last frame barely moves: the beetle's legs stay still.
  With forward motion, one leg moves and the gait isn't readable. The best automatic loop point is poor.
- An empty first frame with the toadstool as last frame gives a nice pop-up, but the growth sheet does that for $0.08,
  needs no matting, and lines up exactly.
- Seedance rejected first+last frame. wan-alpha (community model, native alpha) never got past its cold start.
  Video matting (`sprited/birefnet-video`) works.

### What the prototype does (step 6–11, `proto/`)

- **Backdrop from tree cut-outs**: a 4-trunk atlas, split at its emptiest columns, at three depths.
  Each farther layer is smaller, foggier (mixed toward the haze colour in the shader), blurrier (mip bias = cheap
  depth of field) and moves less with the camera (parallax). Cell sides and feet fade out, so atlas edges and the
  moss band don't show. Keep the gaps between trunks open, or the layers merge into a wall.
- **Curved ground**: the generated moss-and-soil strip is bent along a curve (`groundAt(x)`: swells, a mound under
  the stump, a dip) as a ribbon mesh. u runs along the arc length with mirrored repeat, so the tile seam never
  shows. The normal is blended with straight down so steep bits don't fold. Below it, the library's four soils,
  hex-tiled with the variant picked by depth (step 14; `gl.soil()`, darkened so the mycelium reads; `?soil=flat`
  is the old gradient fill). The strip is the library's first ground strip, on the same humus (`?strip=old`: step 10's). A fogged, blurred second ribbon is a ridge further back. Everything on the ground asks `groundAt`:
  props, mushrooms, mycelium fruiting. The snail and bugs rotate with `slopeAt`, and each foot IKs to the
  ground under it.
- **Mycelium**: a branching random walk in the soil, pale threads over an additive glow. Where a tip reaches the
  surface it may raise a mushroom (growth frames, then a little settle). **Nutrient pulses** run from the roots
  down the tree, preferring branches that lead to mushrooms, and make a mushroom glow when they arrive.
- **Critters**: a generated *legless* side-view body plus procedural legs (two-bone IK, tripod gait for six legs, a
  travelling wave for many) and twitching antennae. At this size this reads better than any generated cycle.
  The snail is one sprite with a peristaltic wave along its foot in the vertex shader.
- Light: warm haze gradient, soft light shafts, drifting motes, vignette, an out-of-focus dark foreground for framing.

### The asset library (step 12)

**[ASSETS.md](ASSETS.md) holds the rules**: the scale (3.75 view units per cm, a fly agaric at most 75 units), what
every asset must be (a photograph in neutral light, or ink and wash for mushrooms and critters; nothing drawn under
it; whole), and per type its size, density,
states (mushrooms a 12-frame life, deadwood a 4-frame decay, everything else static or procedural) and the checks.
The first library had none of that and showed it: a 900 px boulder next to 77 px pebbles, trunks cut by the grid,
critters with legs we can't move, and mushrooms that grew, decayed onto a moss tuft, or neither.

`12-library.ts` is the plan and the generator in one: a `LIBRARY` entry per family says why we need it, its prompt,
grid, kind (sprites, growth sequence, textures) and resolution. Families: stones, full trees and tall trunks (4K, two
per square sheet: drawn big and sharp), grass and small plants, bushes, moss pieces and long moss strips (to lay over
seams), growth sequences (porcini, bonnets, glowing cluster), decay (fly agaric, a dead trunk, a fallen branch),
litter that drops from above (leaves, cones, seeds, a samara), soil textures, and things buried in the soil.
1K for everything drawn small; the whole library cost about $1.90.

The good pictures of earlier steps are **imports** in the same plan (an entry with `source` instead of a prompt):
the moss snail and its crawl sequence, the legless bodies and the twelve critters with legs, the mossy beetle, a
moth, the sixteen mushroom species, both fly-agaric growth sheets, the glowing and pale clusters, the broken snags,
stump and log, the root arch, the boulder, the prototype's tall trunks, and the moss-and-soil ground strip (kind
`ribbon`: cut out whole, packed as a texture that repeats mirrored along curves). They go through the same per-cell
cut, set-wide grade and packer, so everything the prototype draws is in the library.

What nano-banana-2 does with "sprite sheet" prompts, and the answers:

- It draws **grid lines** (sometimes a 2 × 2 grid when 2 × 1 was asked, with black lines straight through the subjects),
  **ground strips** under growth frames, **panels** of a different grey per cell, **captions** with species names
  ("Holly aquifolium"), and **another grid** than asked (4 × 4 for 4 × 3).
- So `matte.py cells` takes the grid from the raw sheet (its drawn lines, else white gutters, else the asked grid),
  and paints out lines that cross subjects (a line row is one colour over nearly the whole width, unlike its
  surroundings; the gap is filled by mirroring the rows above and below, so bark keeps its texture).
- Ground strips under growth frames stay in the pixels. The slicer only measures where a strip starts (`foot`,
  a fraction of the frame height, carried into the manifest), and the sprite shader fades the strip's sides into a
  tuft at runtime (`foot: [start, ramp, side]` in `proto/gl.ts`). Ramp and side width stay tunable, and the
  same mask sinks any prop's base into the ground. Baking the fade went wrong: a wide moss cushion looks like a
  strip, and a fade starting at one row cut a line through it.
- **Matte per cell, not per sheet.** InSPyReNet, BiRefNet and Apple Vision are salient-object models: given a whole
  sheet they decide which subjects matter (two beeches dropped, a dark spruce turned into a ghost). Given one cell they
  keep the one.
- Every prompt bans captions (`NO_TEXT`). An existing raw sheet counts as accepted, so a prompt change doesn't
  silently pay for sheets we keep; `--regen` makes one anew.

### Asset structure for the mode

```
src/modes/forest/assets/      written by matte/pack.py from the library; committed (the real assets)
  atlas-<group>-<n>.webp      sprites per group (mushrooms, critters, plants, ground, underground, wood, trees), 16 px apart
  tex-soil-<n>.webp           repeating textures: own images (GL repeat needs a whole texture)
  manifest.ts                 atlases, frames (atlas rect, anchor, s = view units per texel), sequences, textures (--ts)
src/modes/forest/preload.ts   proto/preload.ts as it is
```

- **Groups → atlases**: one GL texture per type group (`TYPES` in `12-library.ts`), so a layer draws from one
  texture. Shelf-packed tallest first, 16 px apart, so the mip-bias depth of field of one sprite never reaches its
  neighbour; 2048 pages, 4096 for trees.
- **Sizes come from the rules** (ASSETS.md, Scale): every frame is packed at its on-screen size × 2 texels, and
  carries `s` (view units per texel), so a renderer draws it at `w·s × h·s`. A fly agaric is 150 px, a tree 1800.
  The whole library: 213 frames, 14 sequences, 8 atlases, 4 soils and 3 ground strips, 5.2 MB (7.3 MB before, with
  everything packed at whatever size the sheet gave it).
- **Checks**: `pack.py` rejects cells cut by the grid and fragments, warns about wide bases (a tuft under a subject),
  missing cells and low density, and writes `report.json`. Rejections and drops never reach an atlas.
- **Frames** are named `<sheet>/<nn>` by their grid position (stable when a cell drops out), anchored at the bottom
  centre. **Sequences** are `<sheet>.<name>`: `life-amanita.grow` (frames 1–8), `life-amanita.decay` (8–12),
  `deadwood.stub`, `deadwood.branch`.
- **Preloader** (`proto/preload.ts`, no DOM, no renderer): `fetchAssets()` downloads and decodes everything,
  started when the mode is picked so it loads while the user types. Progress is in bytes (the manifest knows every
  file's size, fetches are read as streams), decoding is `createImageBitmap` off the main thread, and one shared
  promise means asking again returns the same download. `uploadAssets(gl)` makes the textures at RUN (milliseconds),
  halving any atlas larger than the device's `MAX_TEXTURE_SIZE`. Progress goes to `#boot` like the other modes'
  boot lines.
- `proto/library.html` loads the packed library through the preloader and shows every group **at true scale** on
  ground lines, next to the mature fly agaric and a 10 cm ruler (zoomed out when a group doesn't fit: trees),
  mushroom lives playing grow → hold → decay, soils tiled to show seams.

### Illustrated or photographic? (step 13)

`13-styles.ts` asks whether the things that move and the mushrooms should be illustrations, to stand out against
the photographic rest. Five styles (gouache, ink and wash, cel-shaded, felt puppet, coloured pencil), each as a fly
agaric life sheet and eight legless critter bodies, cut like the library and put into a prototype still at true
scale next to the photographic ones (`matte/styles.py` → `samples/13-styles/compare.webp`). $0.80.

- All five keep the rules when asked the same way: a 12-frame life, nothing under it, legless bodies facing left.
- Cel-shaded stands out most (the dark outline separates it from busy moss at 75 units); gouache and pencil sit
  between; felt reads as a toy.
- **Chosen: ink and wash** for mushrooms and critters (the field-guide look fits the forest best), photographs for
  everything else. The library's mushroom lives and critter bodies are redrawn in it; the fly agaric is this
  step's sheet. ASSETS.md has the rule.
- The model doesn't always keep the grid in a style either (gouache drew 4 × 4 for 4 × 3, ink and wash 4 × 3 for 4 × 2).

### Soil without visible repeats (step 14)

At the strip's texel scale a 479 px soil tile is 181 view units: about 7 repeats across the view and 20 on screen,
and one bright pebble or leaf in the tile turns into a grid. `proto/tiling.ts` draws the same soil field eight ways
(`samples/14-tiling/`: `all-soil-<n>` a whole view at half size, `detail*` at 1:1, `patch-soil-3` patch sizes).

| technique | taps | look on our soils |
| --- | --- | --- |
| GL repeat (now) | 1 | grid of pebbles (soil-0), of leaves (soil-3), of haze blotches (soil-2) |
| Quilez 1: per-tile offset + mirror, blended near the borders | 4 | grid gone; square, washed-out blend zones where four copies average |
| Quilez 2: smooth Voronoi, Gaussian weights | 9 | organic, but the most blur; the costliest |
| Quilez 3: low-frequency noise picks 1 of 8 offset copies | 2 | cheapest that works; wide blend bands show doubled pebbles |
| hex tiling, linear blend | 3 | patches; the flattest of all (three copies averaged in the corners) |
| **hex tiling, Mikkelsen's luminance weights** | 3 | **contrast kept**: the brighter texel wins where patches meet, so a pebble stays whole instead of a ghost |
| hex, histogram-preserving (Heitz & Neyret) | 3 + LUT | contrast kept by maths (blend Gaussianised texels, divide by \|w\|, map back); per-texture precompute (sort + inverse CDF), here in JS at load |
| hex + the four soil variants by depth + a slow tone | 3 | the only one that looks like a place: horizons (leafy humus, dark humus, plain, stony) with wandering borders |

- Sources: Quilez, [texture repetition](https://iquilezles.org/articles/texturerepetition/) (2015); Heitz & Neyret,
  *High-Performance By-Example Noise using a Histogram-Preserving Blending Operator* (HPG 2018); Mikkelsen,
  *Practical Real-Time Hex-Tiling* (JCGT 2022).
- **No rotation**: the soil is lit from above; a turned or upside-down patch is lit from the side. Offsets and
  left-right mirroring only (Quilez 1 mirrors in y too; here it doesn't).
- All of them need `textureGrad` with the derivatives of the plain UV: the per-patch offsets jump, and `texture()`
  would pick the smallest mip along every patch border (a line of blur).
- Mikkelsen and Heitz–Neyret look alike on soil. Mikkelsen needs no precompute and works on any texture,
  including the array of variants; Heitz–Neyret needs a Gaussianised copy and a LUT per texture, and mixing variants
  breaks its single histogram.
- **Big features don't blend**: soil-3's leaves are half a tile, every patch border cuts one. Patches 2.5× larger
  keep leaves whole but the motif reads again. Things you can recognise (leaves, big stones) belong in the
  `inclusion` sprites, scattered; the soil texture should be the fine, featureless rest.
- Not tried: Wang / corner tiles (aperiodic sets of pre-cut tiles with matching edges, 1 tap, but they must be made
  offline from each soil); a larger synthesised texture (memory). The ground strips' mirrored repeat (a Rorschach
  axis every 520 units) is the same problem in 1D: the moss sprites over seams (ASSETS.md) are meant to hide it.
- **For the mode**: hex tiling with luminance weights over a texture array of the soil variants, the variant per
  vertex from depth + noise, a slow tone on top; leaves and stones as scattered sprites. Three taps per soil pixel.
  The prototype does this now (`gl.soil()`).

## Recommended pipeline for the mode

1. A short style line + nano-banana-2 + one mood reference, **neutral overcast light**, and the "never sawn" rule.
   Generate **sheets** (variety, growth stages) and a few big single props (snags, stumps, trunks, roots, ground
   strip). Budget: roughly $1–2 for a full set.
2. Locally: InSPyReNet on MPS + background decontamination (`matte.py`) → `slice.ts` → `matte.py grade set`. Bake
   the results into WebP atlases for the web build.
3. Everything that moves is procedural: legs, antennae, crawl waves, sway, growth playback, mycelium, pulses.
4. Depth from layers of cut-outs, fog and blur in the shader, curved ground ribbons. The colour of the air is a
   runtime theme. No AI layer decomposition, no video.

## Open problems

- **Size**: the raw samples are ~400 MB. A mode needs a few atlases at a sensible resolution (about 2–4 MB WebP),
  loaded lazily like the mode chunk.
- **Consistency across sessions**: the same prompt + reference keeps the look close, but not identical. Generate a
  whole set in one go, or keep the reference fixed and re-roll single misses.
- The mycelium fills the soil after a minute: it needs pruning/decay, and it should follow the program's genomes, not chance.
- Mushrooms raised by the mycelium need variety (several growth sheets: species, colours) or they read as a pattern.
- Licence and terms of the model outputs need checking before shipping generated art.
- Real prices: the ledger holds estimates. The Replicate dashboard has the actual spend.
