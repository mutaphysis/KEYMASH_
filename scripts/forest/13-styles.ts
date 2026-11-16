// Step 13: should the things that move (critters) and the mushrooms be illustrations, so they read against the
// photographic rest? Five illustration styles, each as a fly agaric life sheet and a sheet of legless critter
// bodies (the same subjects and rules as the library, ASSETS.md), cut like the library, then put into a still of
// the prototype at true scale (fly agaric 75 units, critters 5× life) next to the photographic ones.
// Usage: bun scripts/forest/13-styles.ts

import { existsSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { contact } from './contact';
import { pool, run, SAMPLES, spent } from './replicate';

const OUT = join(SAMPLES, '13-styles');
const MATTE = join(import.meta.dir, 'matte', 'matte.py');

/** One line each: what the picture is made of. */
const STYLES: Record<string, string> = {
  gouache:
    'A storybook gouache painting: soft opaque painted shapes, visible brush strokes, gentle painted shading, a hand-painted picture book look.',
  inkwash:
    'A vintage nature field-guide illustration: fine pen and ink outlines and hatching with loose transparent watercolour washes, white paper showing through.',
  cel: 'A clean cel-shaded illustration: a bold dark outline around every shape, flat colour areas with one darker shade tone and a small highlight, crisp and graphic.',
  felt: 'A handmade stop-motion puppet: made of needle-felted wool and painted clay, soft fuzzy textures and visible handmade imperfections, photographed like a miniature.',
  pencil:
    "A children's book coloured pencil drawing: visible pencil strokes and paper grain, soft layered colour, a light sketchy outline.",
};

const LIGHT = 'Neutral even light, no colour cast, nothing glowing. Plain flat even light grey background. ';
const NO_TEXT = 'No captions, no names, no labels, no words, no numbers, no text of any kind anywhere.';
const NOTHING_UNDER =
  'Nothing under any subject: no ground, no soil, no moss, no grass, no shadow; the plain grey continues down to the bottom edge of every cell. ';
const GRID = (cols: number, rows: number) =>
  `Arrange them as a sprite sheet: a strict grid of ${cols} columns and ${rows} rows of equal cells, one subject per cell, ` +
  'each complete and centred in its cell with empty space around it, nothing touching or crossing the cell borders, no grid lines, no panels. ' +
  NO_TEXT;

const SUBJECTS = {
  mushroom: {
    grid: [4, 3] as [number, number],
    aspect: '4:3',
    growth: true,
    prompt:
      'A 12-frame life cycle of one single red fly agaric toadstool with white warts, the same individual in every frame, exact side view, ' +
      'standing on the same spot at the bottom centre of each cell, at the same scale in every frame. Frames 1 to 8 grow: a tiny white knob, ' +
      'a round white button, the red cap breaking through, a small round red cap on a short stem, the stem stretching, the cap rounding, ' +
      'the cap opening, frame 8 the mature toadstool with a flat open cap filling most of the cell height. Frames 9 to 12 decay: the cap edge ' +
      'curling and fading, the cap sagging and the stem bending, the toadstool collapsing sideways, a small shrivelled remnant. ',
  },
  critters: {
    grid: [4, 2] as [number, number],
    aspect: '16:9',
    growth: false,
    prompt:
      'Eight small creatures seen exactly from the side, all facing left, as separate puppet bodies WITHOUT ANY LEGS AND WITHOUT ANTENNAE ' +
      '(only head, thorax and abdomen), except the snail, which has its body stretched out: a black ground beetle, a grey woodlouse, ' +
      'a red-brown ant, a ladybird, a snail with a spiral shell, a stag beetle, a long-snouted weevil, a hairy spider body. ',
  },
};

const jobs = Object.entries(STYLES).flatMap(([style, line]) =>
  Object.entries(SUBJECTS).map(([subject, s]) => ({
    style,
    subject,
    s,
    prompt: line + ' ' + LIGHT + s.prompt + NOTHING_UNDER + GRID(...s.grid),
  })),
);

const made = (
  await pool(
    jobs.map((j) => async () => {
      const name = `${j.style}-${j.subject}`;
      const raw = join(OUT, 'raw', name + '.png');
      const file = existsSync(raw)
        ? raw
        : (
            await run(
              'google/nano-banana-2',
              { prompt: j.prompt, aspect_ratio: j.s.aspect, output_format: 'png' },
              { step: '13-styles/raw', name, cost: 0.08 },
            )
          )[0]!;
      return { ...j, name, file };
    }),
    4,
  )
).filter((r) => r !== undefined);

for (const r of made) {
  const dir = join(OUT, r.name);
  if (!existsSync(join(dir, 'cells.json')))
    console.log((await Bun.$`uv run --quiet ${MATTE} cells ${r.file} ${dir} ${r.s.grid} ${r.s.growth ? ['--growth'] : []}`.text()).trim());
  const files = readdirSync(dir)
    .filter((f) => f.startsWith('cell-'))
    .sort()
    .map((f) => join(dir, f));
  await contact(
    join(OUT, `sheet-${r.name}.webp`),
    `${r.style} · ${r.subject}`,
    files.map((file) => ({ file, label: basename(file, '.png') })),
    { cols: r.s.grid[0], width: 1200 },
  );
}

// Into the prototype at true scale, next to the photographic library cut-outs (matte/styles.py).
await Bun.$`uv run --quiet ${join(import.meta.dir, 'matte', 'styles.py')} ${OUT} ${join(SAMPLES, '12-library')} ${join(SAMPLES, '7-proto', 'still-12s.png')} ${Object.keys(STYLES)}`;
console.log(`spent so far: $${spent().toFixed(3)}`);
