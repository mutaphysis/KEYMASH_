# KEYMASH_

> every keystroke compiles.

KEYMASH is a live-coding language with one rule: **there are no syntax errors.**
Any text is a valid program — a dog walking over the keyboard, a six-year-old
typing their name, a poem, a shopping list, `HACK THE PLANET!!!`. The
interpreter turns all of it into lines, curves, particles, glitches, music and
speech.

## Running

```sh
bun run build.js        # -> dist/index.html (single self-contained page)
bun test                # fuzz + unit tests for the interpreter
```

Open `dist/index.html` in a browser. Type. Press **RUN**.

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
| CAPS chunk | `WOOF`, `ASDKJ` | spoken out loud (gibberish through speech synthesis) |
| chunk + `?`/`!` | `fjdk?` | spoken as a question / exclamation |
| long chunk (≥5) | `lkjhgfdsa` | casts a **spell** from the effect library, picked by the chunk's hash (same mash → same spell) |
| number | `42` | shown on screen, dialled as DTMF phone tones, becomes the argument of the next op |
| math | `7*6=`, `12/0` | evaluated and rendered on screen; `42` and `∞` have surprises |
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

### In play mode
Tap the screen to play notes and bursts yourself.

## Architecture

```
src/lang/lexer.js    total tokenizer (graphemes -> tokens), math evaluator
src/lang/keys.js     QWERTZ geometry (position, pitch, adjacency), emoji powers
src/lang/vm.js       the interpreter: threads, loops, forks, emits events
src/engine/audio.js  WebAudio synth, drums, sfx, reverb/delay, speech
src/engine/render.js canvas renderer: trails, feedback, sprites, glitch
src/ui/*.js          matrix editor, key bar, play mode, storage
```

The VM is pure (no DOM): `vm.tick()` returns a list of timed events that the
audio engine schedules and the renderer replays at the right moment.
