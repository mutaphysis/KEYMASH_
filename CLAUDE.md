# CLAUDE.md

KEYMASH_ is a live-coding toy: any text is a valid program (no syntax errors, ever). Four modes:
KEYMASH_ (lines → threads → visuals, music, speech), PETRI_ (lines → genomes → a cell culture),
COOKIE_ (the whole text → one recipe → cookies baked in 3D, eaten by tapping) and MYCELIUM_ (under construction:
the whole text → a photographic forest floor seen from the side).
README.md is the user-facing doc (running, architecture, conventions); each mode's language reference
lives in `src/modes/<id>/README.md`. Read them before larger changes.

## Commands

```sh
bun run dev          # Vite dev server; tsc + oxlint + oxfmt problems show in terminal and in-page overlay
bun run build        # tsc + vite build -> dist/ (index.html, main chunk, one chunk per mode; served by GitHub Pages, needs http)
bun test             # test/vm.test.ts (fuzz: the VM must never throw), test/petri.test.ts, test/cookie.test.ts, test/mycelium.test.ts
bun run typecheck    # tsc (TypeScript 7, strict, noUnusedLocals, noImplicitOverride)
bun run lint         # oxlint (scripts/ is ignored)
bun run format       # oxfmt: printWidth 140, single quotes; *.md and public/ are not formatted
bun scripts/sheet.ts # re-render cheat-sheet pictures + the picture table in src/modes/<id>/README.md
bun scripts/icons.ts # re-render public/ icons from scripts/icon.svg
```

Both scripts use playwright-core (headless Chromium) under bun — no python. First run:
`bunx playwright-core install chromium-headless-shell`. tsc covers `scripts/` too; oxlint ignores it.

CI (`.github/workflows/check.yml`) runs lint, format:check, typecheck, test. Pushing to `main` deploys to GitHub Pages.
Git hooks (lefthook): pre-commit formats + lints staged files, pre-push runs tests.

## Layout

- `index.html` — all markup (edit section with header/editor/keybar/controls, play section with stage/hud/log/boot/codeview, the program drawer, the cheat-sheet drawer, toast).
- `src/main.ts` — app shell: layout (phone vs. split view ≥820px), run/edit, hot-swap, drawer, cheat sheet, mode switching. Holds `mode` (the `ModeDef`) and `code` (its loaded `ModeCode`); `switchMode()` is async (awaits `load()`, newest tap wins via a ticket, a failed load toasts and stays). The first mode is awaited with top-level await before the UI wires up. Links: `?mode=<id>&code=<text>` picks the first mode, and with `code` opens stage-only view at the end of the file, waiting for RUN (sound and fullscreen need that tap; it does not autoplay); the parameters are then removed from the URL. `window.KEYMASH` is the debug/browser-test handle.
- `src/modes/types.ts` — `ModeDef` (eager: name, icon, tagline, theme, transition, `load()`), `ModeCode` (lazy: demos, keys, sheet, backdrop, status, `player(audio, host)`, drawer, `runHint` — the line under RUN in stage-only view), `ModePlayer`, `PlayerHost` (what a player may ask of the shell: `edit()`, back to the editor), `Backdrop`, `Sheet`/`SheetCard`. `src/modes/index.ts` — `MODES` registry. Each mode: `index.ts` (its `ModeDef`, in the main bundle) + `mode.ts` (its `ModeCode`, dynamic `import()` → own chunk).
- `src/modes/keymash/` — `vm.ts` (the interpreter: `VM.tick()` returns timed `VMEvent`s), `types.ts` (`VMEvent` union, ops, shapes), `powers.ts` (emoji → op), `Player` (VM on the audio clock, 0.12 s lookahead) + `Renderer` (canvas 2D, world coords ±hw/±hh with `s` px per unit, `handle(VMEvent)`, `frame(dt, level, bass)`).
- `src/modes/petri/` — `genome.ts` (`readCulture`, `kindOf()`), `hybrid.ts` (`hybridise()`: a meal's gene transfer into a new genome with `parents`; `genomeDistance()`), `culture.ts` (`Petri`: feeder + `World`, fixed 30 Hz steps), `sim.ts` (`World`, `DISH_R = 420`; `takeUp()` on engulfing and on eating debris, which keeps its cell's `sp`. `SPECIATION` switches how hybrids arise: `'meal'` (on) founds a species per transfer; `'drift'` keeps the genome a variant (`Species.variantOf`) until `SPLIT_DRIFT`; identity — counts, census, kin, extinction — goes through `kindOf(sp)`, traits through `sp`), `render.ts` (`MicroRenderer`: `cx/cy/R/k` camera, `frame(dt, world, activity)`; the water is a small canvas stretched over the dish, vignette + rim are cached per dish size, repeated strokes go into one path), `ambient.ts` (music). The simulation costs microseconds per frame; drawing pixels is what costs.
- `src/modes/cookie/` — pure and DOM-free: `recipe.ts` (`readRecipe`, `recipeKey`), `shapes.ts` (cutter SDFs, `anchors`, `Field`: one cookie's footprint/bites/piping as a 128² distance tile), `bakery.ts` (`Bakery`: stage timeline → `Look`, `swap`, `bite`, idle nibbling, crumbs, `again()` once `done`; emits `BakeEvent`s). Drawing: `gl.ts` (WebGL2 helpers), `shader.ts` (the raymarched scene, crumbs, motes, the blit with heat haze and tilt-shift), `render.ts` (`CookieRenderer`: `frame(dt, bakery, level)`, `ray()` for taps, a scene target that steps down when frames are slow). `music.ts` (`Jingle`: a band per dough). The player adds its own `<canvas class="stage3d">` after `#stage` (WebGL needs a canvas without a 2D context) and hides it in `stop()`. Shader tuning: look at frames (`bun scripts/sheet.ts`), headless Chromium renders it with SwiftShader; for GPU timings launch it with `--use-angle=metal --enable-gpu` (macOS: the real GPU).
- `src/modes/mycelium/` — `ground.ts` (pure: `readGround(src)` → the curve's swells and mounds, soil horizon depths, noise drift; `heightAt`, `mixGround` for easing edits), `assets.ts` (`fetchAssets()`: only the textures the scene uses, byte progress, decoded premultiplied; started when `mode.ts` loads), `assets/` (the forest library copied from `scripts/forest/samples/pack`, as pack.py wrote it; ignored by oxfmt), `gl.ts` (WebGL2 helpers), `render.ts` (`ForestRenderer`: 2D camera `cam` + `zoom`, `pan`, `zoomAt`; layers sky → ground → post into a budget-sized target; `wire` draws every draw's edges coloured per shader/material, `wireLegend()` — a new layer adds its colour there), `shaders/` (one GLSL piece per file, imported `?raw`, assembled in `shaders/index.ts`: `noise`, `camera`, `blend` (height blend), `hex` (hex tiling), `soil` (horizons), `strip` (the ground strip in 1D Voronoi cells, no mirror axes), then each stage's `main()`; `wire.*` for the debug wireframe), `player.ts` (drag/scroll pans, pinch/ctrl+scroll zooms; in dev builds a grid corner button toggles the wireframe). No language and no cheat-sheet cards yet. A new text needn't transition smoothly: the forest will later drop away and be recreated per text, so don't spend effort on smooth changes between texts.
- `src/modes/<id>/sheet.ts` — `SHEET` (the cheat sheet behind the book button: a one-sentence intro + exactly 12 `SheetCard`s per mode — the grid in `card.css.ts` uses 2/3/4/6 columns so rows stay full, 6 × 2 on desktop — with snippet, short name — no explanations, the user wants it terse —, capture time `at`, camera `zoom`; one-line snippets only); pictures in `sheet/<card>.webp`, loaded via `import.meta.glob` (URLs; the files load lazily when the sheet opens). `src/modes/<id>/README.md` — the mode's language reference.
- `src/lang/` — shared by every mode, pure and DOM-free: `lexer.ts` (syntax only: graphemes, words, numbers, runs, quotes, math; meaning is per mode), `keys.ts` (QWERTZ geometry), `rng.ts` (seeded hash + PRNG).
- `src/engine/sound.ts` — the `Sound` vocabulary (`note`/`drum`/`sfx`/`dtmf`, instruments, sfx kinds); `src/engine/audio.ts` — the shared WebAudio engine (`play(Panned)`), speech, typing sounds. Neither knows any mode.
- `src/ui/budget.ts` — `PixelBudget`: watches the frame pace and steps a renderer down a ladder of pixel budgets (`LADDER`), never up. COOKIE_ sizes its scene target with it, KEYMASH_ and PETRI_ their canvas (starting unlimited).
- `src/ui/follow.ts` — `CodeFollow`: keeps `#codeview` on what is being read. `show(span, by)` per highlight (`by` = line/thread); it only scrolls (native smooth scroll, once per move) when no line being read is in sight, so parallel lines don't pull the view back and forth. Every player uses it; `main.ts` empties `#codeview` when play stops or the mode changes.
- `src/ui/share.ts` — `shareUrl(mode, code)` (a `?mode=&code=` link) and `shareLink()` (`navigator.share`, else the clipboard; call it straight from the click). `main.ts` `shareProgram()` backs the share play button and `PlayerHost.share()` (COOKIE_'s done panel).
- `src/ui/icon.ts` — UI icons: `iconEl(name)` / `setIcon(el, name)`; `IconName` comes from `src/ui/icons/index.ts`, written by `bun scripts/ui-icons.ts` (the list of MingCute icons lives there; it downloads the SVGs from the Iconify API into `src/ui/icons/`). Each SVG is imported with `?url` and drawn as a CSS `mask-image` over `currentColor` (`icon.css.ts`), so it is 1em and takes the text colour. `km-button icon=`, `KmItem` `icon`, `KmSelect` `icon`, `toast(text, icon)`, the key bar's cursor keys use it.
- `src/ui/components/` — light-DOM custom elements (`km-button`, `km-mute`, `km-mode-icon`, `km-item`, `km-select`, `km-toast`, `km-drawer`, `km-card`), each registered with `customElements.define` + `HTMLElementTagNameMap`, re-exported from `index.ts`. The cheat sheet is a second `<km-drawer id="sheet">` filled with `KmCard.intro()` + `KmCard.grid(cards, onPick)`; a card is a button, `main.ts` `addLine()` appends its snippet as a new last line (no focus, so no phone keyboard) and the sheet stays open.
- Fullscreen: `<km-button id="btn-full" variant="corner">` in `#stageWrap`; `stageOnly()` in `main.ts` toggles `#app.stageonly` (CSS in `global.css.ts` hides `#edit`, `#codeview`, `.playbtns`; the players refit via their ResizeObserver) and requests real fullscreen on `<html>` when `document.fullscreenEnabled`; `fullscreenchange` to none (Esc) clears the class.
- `src/styles/theme.css.ts` — theme contract (`vars`, `layout`, `rgba()`); `global.css.ts` — shell styles (header grid areas: icon, logo, ver, status, sheet, mute). Each mode's `theme.css.ts` fills the contract via `createTheme`.
- `scripts/sheet.ts` — starts a Vite dev server (config-less: vanilla-extract + version defines), opens `scripts/sheet/index.html` in Chromium, calls `window.shots()` (`scripts/sheet/shoot.ts`: replays each card through the real VM/`Renderer` or `Petri`/`MicroRenderer` in simulated time, `Math.random` seeded per card), writes the WebPs and rewrites the README table between `<!-- sheet:start … -->` / `<!-- sheet:end -->`. A new mode needs its own capture function in `SHOOT`.
- `scripts/icons.ts` — renders `scripts/icon.svg` to the PNGs in `public/` (byte output differs between Chromium versions; don't commit re-renders of an unchanged icon). `scripts/ui-icons.ts` — the UI icon list + downloader (see `src/ui/icon.ts`). `scripts/checker-lint.ts` — oxlint + oxfmt report for the dev overlay.

## Conventions

- Styles: vanilla-extract only (`*.css.ts`), components keep their styles next to them. Colours via theme tokens (`vars.*`, `rgba(vars.rgb.fg, a)`), never hardcoded per mode in shared UI.
- Text: every string goes through `defineMessages(en, de)` — shared UI in `src/i18n.ts`, mode text in `src/modes/<id>/messages.ts`. `de` must mirror `en` exactly (tsc enforces). Markup uses `data-i18n`, `data-i18n-title`, `-aria-label`, `-placeholder`. `km-button` `label`/`title-key` are shared message ids. German is casual "du", short.
- Icons: buttons, drawer rows, selects and toasts show icons from `src/ui/icon.ts` (one set: MingCute, filled), never emoji or symbol characters (▶, ✖, ⛶). A new icon: add it to `ICONS` in `scripts/ui-icons.ts`, run `bun scripts/ui-icons.ts`, commit the SVG and `src/ui/icons/index.ts`. Emoji stay where they are program text: demos, the key bar's emoji keys, what a running program shows.
- Shared code (`src/lang/`, `src/engine/`, `src/ui/`, `src/main.ts`, `src/i18n.ts`) never imports from `src/modes/<id>/` (only the registry `src/modes/index.ts`); a mode's interpreter, events and effects live in its folder. Several more modes are planned — keep it that way.
- A mode's `index.ts` is in the main bundle: only light imports there (messages, theme). Anything heavy belongs behind `mode.ts`. Check the build output: each mode should be one `mode-*.js` chunk.
- Adding a KEYMASH_ effect = new `VMEvent` variant in `src/modes/keymash/types.ts`; the compiler points at every handler. A new sound kind goes into `src/engine/sound.ts`.
- The interpreter must stay total: any input (emoji, lone surrogates, NUL) must not throw — the fuzz test guards this.
- The stage canvas is shared by the 2D players; only the `active` one sizes it. A mode that needs WebGL brings its own canvas (see COOKIE_).
- Changing a card's snippet, name or timing in `sheet.ts`: re-run `bun scripts/sheet.ts` and look at the pictures (they must show something recognisable at ~170 px wide).
- Respect `prefers-reduced-motion` (`gentle` flag in both renderers).
- Comments explain *why*, in plain short sentences; keep the existing tone.
- Keep README in sync when behaviour, scripts or the language change.

## Commits

- Small and focused: one feature, fix or chore per commit, with its docs. Commit each step as soon as it works (checks green) instead of piling everything into one commit at the end.
- Message style: `Topic: what changed and why`, one line, e.g. `Mode transitions: clear every mode's animation class first, so KEYMASH_'s glitch plays after PETRI_ too`.
