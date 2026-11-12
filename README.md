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

### Threads
Every non-empty **line** is a thread. All threads run **in parallel**, in sync
with a global clock (16th notes, 120 BPM by default). When a thread reaches the
end of its line it loops — and each loop (a *generation*) mutates a little:
colors shift, the harmony moves on.

### Tokens
The source is split into graphemes and grouped into tokens:

| Token | Example | Meaning |
|---|---|---|
| keyword | `circle`, `woof`, `regen` | a named effect (English + German), 1 step |
| word | `asdfjkl` | unknown words run **letter by letter**: each letter is an op |
| CAPS word | `HELLO` | executed *and* spoken out loud (speech synthesis) |
| number | `42` | shown on screen, dialed as phone tones, becomes the argument of the next op |
| math | `7*6=`, `12/0` | evaluated, rendered on screen, result becomes the argument |
| quote | `"hello dog"` | spoken (unclosed quote: rest of the line) |
| emoji | `🐶🔥🌈` | stamped on screen; many have special powers |
| symbol | `!` `~` `#` … | see below; runs (`!!!`) are stronger |

Words are matched forgivingly: case-insensitive, accents stripped, plural `s`
dropped and repeated letters collapsed (`booooom` → `boom`, louder).

### Letters (the dog alphabet)
```
a arc        b bass+pulse   c circle      d kick+zoom    e echo/feedback
f forward    g glitch       h hi-hat      i ping+line    j jump+boing
k snare      l long line    m mirror      n note+dot     o ring
p particles  q quake        r rotate      s sine curve   t triangle
u octave up  v vibrato      w wave        x explode      y yay confetti
z zap+lightning
```
Uppercase letters are twice as big and loud. Non-latin letters map onto this
alphabet too.

### Symbols
```
!  BOOM            ?  random op        .  rest          ,  short rest
~  sine glide      -  line             _  floor         |  clap + vertical
/ \ diagonals      *  star burst       #  big glitch    @  spiral
$  money rain      %  kaleidoscope     ^  jump up       +  grow
=  chord           <  turn left        >  turn right    :  repeat last op
&  fork thread     ( ) loop (n( … ) repeats n times)
[ ] spawn a parallel thread for the bracket content
{ } spin the view   ` small glitch      ; snare
```
Unmatched brackets are fine: `)` alone jumps back to the start of the line,
`(` alone simply marks a spot, `[` without `]` spawns the rest of the line.

### Keywords (selection)
- **shapes** circle/kreis, square/box, triangle/dreieck, star/stern, heart/herz,
  flower/blume, ring, spiral, tree/baum (fractal), sun/sonne, grid
- **curves** sin, cos, tan, wave/welle, rose, zigzag, bounce, dna, knot,
  scribble, math (random function with formula on screen)
- **turtle** go/vor, back, left/links, right/rechts, home, jump
- **color** red/rot, green/grün, blue/blau, gold, pink, rainbow/regenbogen, …
- **particles** fire/feuer, rain/regen, snow/schnee, confetti, fireworks,
  bubbles, smoke, sparkle, hearts, stars, money
- **screen** glitch, spin/dreh, zoom, shake, flip, mirror/spiegel, kaleido,
  tunnel, warp, tilt, calm/ruhe, invert, dark/light
- **sound** beep, boop, bass, drum, kick, snare, clap, hat, bell, laser,
  siren, chord, arp, woof/wuff, meow/miau, moo/muh, quack, oink, roar, fart
- **instruments** piano, organ, bell, bass, chip, pad, robot, pluck, lead
- **music** fast/schnell, slow/langsam, tempo N, major/dur, minor/moll, blues,
  spooky, japan
- **speech** say/sag … (rest of the clause), ALL CAPS, `"quotes"`
- **hacker** hack, matrix, sudo, root, access, password, mainframe, firewall,
  virus, cyber, download …
- **creatures** dog/hund, cat/katze, cow/kuh, duck/ente, pig, bird/vogel,
  fish, dino, dragon/drache, unicorn/einhorn, ghost, alien, robot, rocket …
- **control** repeat/nochmal, wait/warte, stop/halt, fork/clone, random/zufall,
  chaos

## Architecture

```
src/lang/lexer.js    total tokenizer (graphemes -> tokens), math evaluator
src/lang/words.js    keyword dictionary, emoji powers
src/lang/vm.js       the interpreter: threads, loops, forks, emits events
src/engine/audio.js  WebAudio synth, drums, sfx, reverb/delay, speech
src/engine/render.js canvas renderer: trails, feedback, sprites, glitch
src/ui/*.js          matrix editor, key bar, play mode, storage
```

The VM is pure (no DOM): `vm.tick()` returns a list of timed events that the
audio engine schedules and the renderer replays at the right moment.
