# CLAUDE.md

KEYMASH_ is a live-coding toy: any text is a valid program (no syntax errors, ever). Two modes:
KEYMASH_ (lines → threads → visuals, music, speech) and PETRI_ (lines → genomes → a cell culture).
README.md is the user-facing doc (running, architecture, conventions); each mode's language reference
lives in `src/modes/<id>/README.md`. Read them before larger changes.

## Commands

```sh
bun run dev          # Vite dev server; tsc + oxlint + oxfmt problems show in terminal and in-page overlay
bun run build        # tsc + vite build -> dist/ (index.html, main chunk, one chunk per mode; served by GitHub Pages, needs http)
bun test             # test/vm.test.ts (fuzz: the VM must never throw), test/petri.test.ts
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
- `src/main.ts` — app shell: layout (phone vs. split view ≥820px), run/edit, hot-swap, drawer, cheat sheet, mode switching. Holds `mode` (the `ModeDef`) and `code` (its loaded `ModeCode`); `switchMode()` is async (awaits `load()`, newest tap wins via a ticket, a failed load toasts and stays). The first mode is awaited with top-level await before the UI wires up. `window.KEYMASH` is the debug/browser-test handle.
- `src/modes/types.ts` — `ModeDef` (eager: name, icon, tagline, theme, transition, `load()`), `ModeCode` (lazy: demos, keys, sheet, backdrop, status, player, drawer), `ModePlayer`, `Backdrop`, `Sheet`/`SheetCard`. `src/modes/index.ts` — `MODES` registry. Each mode: `index.ts` (its `ModeDef`, in the main bundle) + `mode.ts` (its `ModeCode`, dynamic `import()` → own chunk).
- `src/modes/keymash/` — `vm.ts` (the interpreter: `VM.tick()` returns timed `VMEvent`s), `types.ts` (`VMEvent` union, ops, shapes), `powers.ts` (emoji → op), `Player` (VM on the audio clock, 0.12 s lookahead) + `Renderer` (canvas 2D, world coords ±hw/±hh with `s` px per unit, `handle(VMEvent)`, `frame(dt, level, bass)`).
- `src/modes/petri/` — `genome.ts` (`readCulture`), `culture.ts` (`Petri`: feeder + `World`, fixed 30 Hz steps), `sim.ts` (`World`, `DISH_R = 420`), `render.ts` (`MicroRenderer`: `cx/cy/R/k` camera, `frame(dt, world, activity)`), `ambient.ts` (music).
- `src/modes/<id>/sheet.ts` — `SHEET` (the 📖 cheat sheet: a one-sentence intro + exactly 12 `SheetCard`s per mode — the grid in `card.css.ts` uses 2/3/4/6 columns so rows stay full, 6 × 2 on desktop — with snippet, short name — no explanations, the user wants it terse —, capture time `at`, camera `zoom`; one-line snippets only); pictures in `sheet/<card>.webp`, loaded via `import.meta.glob` (URLs; the files load lazily when the sheet opens). `src/modes/<id>/README.md` — the mode's language reference.
- `src/lang/` — shared by every mode, pure and DOM-free: `lexer.ts` (syntax only: graphemes, words, numbers, runs, quotes, math; meaning is per mode), `keys.ts` (QWERTZ geometry), `rng.ts` (seeded hash + PRNG).
- `src/engine/sound.ts` — the `Sound` vocabulary (`note`/`drum`/`sfx`/`dtmf`, instruments, sfx kinds); `src/engine/audio.ts` — the shared WebAudio engine (`play(Panned)`), speech, typing sounds. Neither knows any mode.
- `src/ui/components/` — light-DOM custom elements (`km-button`, `km-mute`, `km-mode-icon`, `km-item`, `km-select`, `km-toast`, `km-drawer`, `km-card`), each registered with `customElements.define` + `HTMLElementTagNameMap`, re-exported from `index.ts`. The cheat sheet is a second `<km-drawer id="sheet">` filled with `KmCard.intro()` + `KmCard.grid(cards, onPick)`; a card is a button, `main.ts` `addLine()` appends its snippet as a new last line (no focus, so no phone keyboard) and the sheet stays open.
- Fullscreen: `<km-button id="btn-full" variant="corner">` in `#stageWrap`; `stageOnly()` in `main.ts` toggles `#app.stageonly` (CSS in `global.css.ts` hides `#edit`, `#codeview`, `.playbtns`; the players refit via their ResizeObserver) and requests real fullscreen on `<html>` when `document.fullscreenEnabled`; `fullscreenchange` to none (Esc) clears the class.
- `src/styles/theme.css.ts` — theme contract (`vars`, `layout`, `rgba()`); `global.css.ts` — shell styles (header grid areas: icon, logo, ver, status, sheet, mute). Each mode's `theme.css.ts` fills the contract via `createTheme`.
- `scripts/sheet.ts` — starts a Vite dev server (config-less: vanilla-extract + version defines), opens `scripts/sheet/index.html` in Chromium, calls `window.shots()` (`scripts/sheet/shoot.ts`: replays each card through the real VM/`Renderer` or `Petri`/`MicroRenderer` in simulated time, `Math.random` seeded per card), writes the WebPs and rewrites the README table between `<!-- sheet:start … -->` / `<!-- sheet:end -->`. A new mode needs its own capture function in `SHOOT`.
- `scripts/icons.ts` — renders `scripts/icon.svg` to the PNGs in `public/` (byte output differs between Chromium versions; don't commit re-renders of an unchanged icon). `scripts/checker-lint.ts` — oxlint + oxfmt report for the dev overlay.

## Conventions

- Styles: vanilla-extract only (`*.css.ts`), components keep their styles next to them. Colours via theme tokens (`vars.*`, `rgba(vars.rgb.fg, a)`), never hardcoded per mode in shared UI.
- Text: every string goes through `defineMessages(en, de)` — shared UI in `src/i18n.ts`, mode text in `src/modes/<id>/messages.ts`. `de` must mirror `en` exactly (tsc enforces). Markup uses `data-i18n`, `data-i18n-title`, `-aria-label`, `-placeholder`. `km-button` `label`/`title-key` are shared message ids. German is casual "du", short.
- Shared code (`src/lang/`, `src/engine/`, `src/ui/`, `src/main.ts`, `src/i18n.ts`) never imports from `src/modes/<id>/` (only the registry `src/modes/index.ts`); a mode's interpreter, events and effects live in its folder. Several more modes are planned — keep it that way.
- A mode's `index.ts` is in the main bundle: only light imports there (messages, theme). Anything heavy belongs behind `mode.ts`. Check the build output: each mode should be one `mode-*.js` chunk.
- Adding a KEYMASH_ effect = new `VMEvent` variant in `src/modes/keymash/types.ts`; the compiler points at every handler. A new sound kind goes into `src/engine/sound.ts`.
- The interpreter must stay total: any input (emoji, lone surrogates, NUL) must not throw — the fuzz test guards this.
- The stage canvas is shared by both players; only the `active` one sizes it.
- Changing a card's snippet, name or timing in `sheet.ts`: re-run `bun scripts/sheet.ts` and look at the pictures (they must show something recognisable at ~170 px wide).
- Respect `prefers-reduced-motion` (`gentle` flag in both renderers).
- Comments explain *why*, in plain short sentences; keep the existing tone.
- Keep README in sync when behaviour, scripts or the language change.

## Commits

- Small and focused: one feature, fix or chore per commit, with its docs. Commit each step as soon as it works (checks green) instead of piling everything into one commit at the end.
- Message style: `Topic: what changed and why`, one line, e.g. `Mode transitions: clear every mode's animation class first, so KEYMASH_'s glitch plays after PETRI_ too`.
