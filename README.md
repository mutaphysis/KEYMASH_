# KEYMASH_

> every keystroke compiles.

KEYMASH is a live-coding language with one rule: **there are no syntax errors.**
Any text is a valid program — a dog walking over the keyboard, a six-year-old
typing their name, a poem, a shopping list, `HACK THE PLANET!!!`. The
interpreter turns all of it into lines, curves, particles, glitches, music and
speech.

## Running

TypeScript (strict) + Vite, with bun as package manager and test runner.

```sh
bun install
bun run dev        # Vite dev server with hot reload
bun run build      # tsc typecheck + vite build -> dist/index.html (one self-contained file)
bun run preview    # serve the production build
bun test           # fuzz + unit tests for the interpreter
```

The build is a single HTML file with everything inlined (vite-plugin-singlefile),
so it also works opened straight from disk or as a Claude artifact.

It is an installable web app (`public/manifest.webmanifest`) with the fonts baked in (no
external requests at all) and it respects the system's "reduce motion" setting: on iOS use Share → Add to
Home Screen, on Android/desktop Chrome the install button. The icon (a paw whose toes
are the A S D F keycaps) lives in `scripts/icon.svg`; `bun scripts/icons.ts` re-renders the PNGs.

The header shows the build: `v<package version> · #<CI run> · <commit>` (local builds
omit the run number, the dev server shows `dev`). Bump the version with
`npm version minor --no-git-tag-version` (or edit `package.json`).

Every push to `main` runs the tests, builds the page and deploys it to GitHub
Pages (`.github/workflows/pages.yml`).

## The language

Keysmash doesn't produce real words, so KEYMASH never looks words up. It reads
*how* the keys were hit: where they sit on the keyboard, how they cluster,
repeat and roll.

### Threads
Every non-empty **line** is a thread. All threads run **in parallel**, in sync
with a global clock (16th notes, 120 BPM). When a thread reaches the end of its
line it loops, and every loop (a *generation*) mutates: colours shift, the
keyboard map rotates, the harmony moves on (i – IV – III – VII).

### Key geometry (German QWERTZ)
Each letter is placed by **where its key sits**:

- **position** – the key's spot on the keyboard is its spot on screen. A key-cap
  lights up there and the paw's path between keys is drawn as a glowing line.
  Every thread gets its own rotated copy of the keyboard.
- **pitch** – column = scale step (left low, right high), row = octave
  (`qwertz…` high, `asdf…` middle, `yxcv…` low). Everything is pentatonic, so
  it always sounds fine.

### Mash patterns
| Pattern | Example | Effect |
|---|---|---|
| held key | `jjjjjjj` | ratchet: the sound repeats as a roll, stream of particles, shake when long |
| roll over neighbours | `asdf`, `poiu` | glissando + an arcing sweep through the keys |
| CAPS chunk | `WOOF`, `ASDKJ` | spoken out loud — by the system voice, or by the built-in *babble* voice (pick in 📂 LOAD → VOICE; default on Firefox/macOS, where system speech clicks) |
| chunk + `?`/`!` | `fjdk?` | spoken as a question / exclamation |
| long chunk (≥5) | `lkjhgfdsa` | casts a **spell** from the effect library, picked by the chunk's hash (same mash → same spell). Spells have a cooldown shared by all threads: 1.5 s each, and all hacker spells together at most once every 4 s. While a spell cools down, the chunk just floats away as text. |
| number | `42` | shown on screen, dialled as DTMF phone tones, becomes the argument of the next op |
| math | `7*6=`, `12/0` | evaluated and rendered on screen, spread over the stage without overlapping (max 6 at once); `42` and `∞` have surprises, at most once every 4 s |
| quote | `"hello"` | spoken (unclosed quote: rest of the line) |
| emoji | `🐶🔥🌈` | stamped on screen; many have powers (🐶 runs and barks, 💥 explodes, 🌀 tunnels…) |

### Letters (the dog alphabet)
Besides its position and pitch, every letter has a character:
```
a arc        b bass+pulse   c circle      d kick+zoom    e echo/feedback
f forward    g glitch       h hi-hat      i ping+line    j jump+boing
k snare      l long line    m mirror      n note+dot     o ring
p particles  q quake        r rotate      s sine curve   t triangle
u octave up  v vibrato      w wave        x explode      y yay confetti
z zap+lightning
```
Uppercase is twice as big and loud. Umlauts and other alphabets fold onto keys.

### Symbols
```
!  BOOM            ?  random letter     .  rest          ,  short rest
~  sine glide      -  line              _  floor         |  clap + vertical
/ \ diagonals      *  star burst        #  big glitch    @  spiral
$  money rain      %  kaleidoscope      ^  jump up       +  grow
=  chord           <  turn left         >  turn right    :  repeat last op
&  fork thread     ( ) loop (n( … ) repeats n times)
[ ] spawn a parallel thread for the bracket content
{ } spin the view   ` small glitch       ; snare
```
Unmatched brackets are fine: `)` alone jumps back to the start of the line,
`(` alone simply marks a spot, `[` without `]` spawns the rest of the line.
Runs of a symbol (`!!!`) are stronger.

### Spells (output only)
Shapes (circle, star, heart, flower, fractal tree, snowflake…), curves with their
formula on screen (sin, cos, tan, rose `r = cos(kθ)`, Lissajous knots, random
function plots), particle storms (fire, rain, snow, confetti, fireworks,
bubbles, money), screen tricks (glitch, spin, zoom, flip, mirror, kaleidoscope,
feedback tunnel, warp), instrument and scale changes, hacker banners
(`ACCESS GRANTED`, `DOWNLOADING MORE RAM`…), and creatures: dogs, cats, dinos,
dragons, unicorns, a squirrel that gives every thread the zoomies.

Also: fractals and attractors drawn live with their formula (Sierpiński triangle, Koch
snowflake, dragon curve, Lorenz attractor, spirograph, golden spiral, π, `10 PRINT`),
sky effects (aurora, black hole, constellations with made-up names, meteor shower),
instruments (ECG heartbeat, radar sweep, barcode scanner), set pieces (disco, fanfare,
drum fill, a blue screen) and more creatures (bee, frog, owl, whale, snake).

### Tempo
There is no tempo setting. The text sets it: shouty mashing (CAPS, `!`, held keys) plays
faster, calm text (spaces, dots, `~`) plays slower, between 70 and 120 BPM (never faster). Speed-up and
slow-down spells push it around and it drifts back. Tap the stage four times in a steady
rhythm and the program follows your beat.

### In play mode
Tap the screen to play notes and bursts yourself.

### Side by side & live coding
On wide screens (iPad landscape, desktop) editor and stage sit side by side.
While a program runs, every edit is hot-swapped into it ~0.6 s after you stop
typing — the clock, the picture and the sound keep going.

### Typing sounds
In the editor every key plays a soft kalimba note (pitched by its position on
the keyboard), space is a brush, Enter strums a chord, backspace sighs, and a
warm pad breathes in while you type. Fast typing gets quieter, not louder.

## PETRI_ — the second mode

**Double-tap the icon in the header** (or the logo, or use 📂 LOAD → MODE) to switch.
KEYMASH_ is loud and fast; PETRI_ is a quiet culture of cells under a dark-field
microscope. Each mode keeps its own draft and its own saves.

### Every line is a genome
How a line was typed decides what grows from it:

| In the line | Trait |
|---|---|
| keyboard row the paw stayed on | body: home row → amoeba, top row → flagellate, bottom row → coccus |
| `-` `_` `\|`, long words | rod bacterium (bacillus) |
| `@`, many `s` | spirillum |
| `#` `%`, digits | diatom (glass shell, armoured) |
| held keys `jjjj`, `=` | ciliate |
| `(` `)`, many `o` | volvox (rolling colony) |
| where on the keyboard | colour |
| vowels, word length | size |
| CAPS | predator (lots) or omnivore (some) |
| `*`, 🌿 ☀️ | photosynthetic, glows |
| `!` | toxic: whoever eats it gets sick |
| `&` 💞 | symbiotic: shares food with other symbionts |
| `...` 🍄 | leaves spores when it dies |
| `?` | mutates more when dividing |
| `+` | divides sooner |
| spaces | calmer, slower |

Every species gets a binomial name made from its own keysmash (*Asdifella jkulula*,
*Hunterophyta grana*) and is introduced in the dish when it first appears.

### Every line is also a feeder
The same line is read slowly, one token per beat (0.75 s), all lines in parallel:
words release cells of that species, numbers drop algae, `.` crumbs, `*` light,
`~` `@` a swirling current, `-` `/` a straight current, `!` a nutrient burst,
`#` sediment; emoji: 🌿 a garden that keeps growing, ☀️ light, 💧 current, 🫧
nutrients, 🍄 spores, 🦠 more cells, ❄️ cold, 🔥 warmth, ☠️ toxin, 🍬 sugar, 💞 a call
to the symbionts. Sums (`3*7=`) and `"quotes"` are written into the water.
Tap the dish to drop food.

### Life in the dish
Cells sense food, prey and threats. Rod bacteria run and tumble (keep running while
food gets closer — real chemotaxis), flagellates dart, amoebae crawl, cocci jiggle and
cluster, volvox rolls. Grazers eat algae, photosynthetic cells feed on light,
predators engulf smaller cells of other species (toxic prey makes them sick), symbionts
even out their energy when they touch. Cells divide with small mutations, age and
die; their debris feeds the next generation and spores hatch later. Division is drawn
as it happens: cells with a nucleus go through mitosis (the envelope dissolves,
chromosomes line up on the spindle and are pulled apart, a cleavage furrow pinches the
membrane, two nuclei form), bacteria split by binary fission (the rod doubles, the DNA
separates, a wall grows in from the middle), ciliates split front to back. Dying cells
swell, grey, their membrane breaks up and their contents drift away. Field notes
record the firsts: first division, first engulfing, extinctions.

### Balance
The code only inoculates (up to 4 cells per species); growth after that is up to the
culture. Above a comfortable 34 cells the dish pushes back: metabolism rises, cells
age faster and need more energy to divide. All food rots. Cells are soft bodies and
never overlap; swimmers turn first and then swim along their body axis. Over five
minutes the demos settle at 20–45 cells with births about equal to deaths.

### Sound
Every culture has its own music, picked from the hash of its text: one of five moods
(Lydian, Dorian, Aeolian, open suspended, Hirajoshi), each with its own four-chord
progression and pad sound, in any of 12 keys, at 60–84 BPM, straight or in triplets,
with 2, 4 or 8 bars per chord. Every body type plays its own instrument (amoeba felt
piano, rod marimba, coccus pluck, spirillum FM glass, diatom bell, ciliate vibraphone,
flagellate kalimba, volvox breath; predators an octave lower), so a culture's species
are its orchestra. Within a run the starting chord varies, a soft bass marks each
chord, the key may move by a fourth after each cycle, the pad brightens as the dish
fills, and every fifth generation plays a little motif. Death is a low wooden tone,
engulfing a gloop, a new cell a water drop. Typing in the editor drips water.

## Architecture

```
src/lang/types.ts    the event protocol (discriminated union) + op / sound / shape kinds
src/lang/lexer.ts    total tokenizer (graphemes -> tokens), math evaluator
src/lang/keys.ts     QWERTZ geometry (position, pitch, adjacency), emoji powers
src/lang/vm.ts       the interpreter: threads, loops, forks, emits events
src/engine/audio.ts  WebAudio synth, drums, sfx, reverb/delay, typing lounge, speech
src/engine/render.ts canvas renderer: trails, feedback, sprites, glitch
src/ui/*.ts          matrix editor, key bar, play mode, storage
src/micro/genome.ts  PETRI_: line -> species genome + feeder steps, binomial names
src/micro/sim.ts     PETRI_: seeded ecosystem simulation (pure, fixed step)
src/micro/culture.ts PETRI_: reads the lines beat by beat, drives the world
src/micro/render.ts  PETRI_: dark-field microscope renderer, per-body anatomy
src/micro/ambient.ts PETRI_: pad, water bed, quantised interaction voices
src/micro/player.ts  PETRI_: play mode, census, field notes
src/main.ts          wiring, layout (phone / split view), live hot-swap; mode switching
```

The VM is pure (no DOM): `vm.tick()` returns a list of timed `VMEvent`s that the
audio engine schedules and the renderer replays at the right moment. Adding an
effect means adding a variant to `VMEvent` — the compiler then points at every
place that has to handle it.

## License

CC0 1.0 Universal — public domain. Mash freely.
