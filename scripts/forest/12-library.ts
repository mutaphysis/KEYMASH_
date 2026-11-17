// Step 12: the asset library the mode will need. This file is the plan: what we need, why, the prompt that
// makes it, and the rules it follows (ASSETS.md: one type per sheet, the type sets size, states and checks).
//
// Everything in neutral overcast light (the mood comes from the runtime theme, step 11), wood never sawn
// (step 9), on flat grey for the local cut-out (step 10), nothing under a subject, never a caption. No reference
// picture: it pulls everything amber. Sheets are cut into cells by the grid the model drew, each cell matted on
// its own (matte.py cells), and graded as a set; soil textures are split by grid and made seamless instead.
//
// Resolution per sheet: enough for the type's size at 2 texels per view unit (ASSETS.md, Scale). 4K for
// trunks and trees, 2K for the leaf cover (strips wider than the view), 1K for the rest (a mature fly agaric is packed at 150 px).
// Google's rates: $0.067 (1K), $0.101 (2K), $0.151 (4K); the guard counts $0.08 / $0.12 / $0.18.
//
// A sheet whose raw picture exists is accepted and not generated again, even after its prompt changed;
// --regen name,name throws those away and makes them anew. --recut name,name (or all) cuts again from the raw
// sheet (free). The plan is written to samples/12-library/plan.json for the packer (matte/pack.py).
// Usage: bun scripts/forest/12-library.ts [--only name,name] [--regen name,name] [--recut name,name|all]

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { contact } from './contact';
import { pool, run, SAMPLES, spent } from './replicate';

const OUT = join(SAMPLES, '12-library');
const MATTE = join(import.meta.dir, 'matte', 'matte.py');
const COST = { '1K': 0.08, '2K': 0.12, '4K': 0.18 } as const;

// ---- the rules (ASSETS.md) ----------------------------------------------------------------------------------

/** The focus plane: a mature fly agaric (about 20 cm) stands at most 75 units; the 1280 x 720 view shows about 3.4 x 1.9 m. */
export const UNITS_PER_CM = 3.75;
const cm = (n: number) => n * UNITS_PER_CM;

type Edge = 'top' | 'bottom' | 'left' | 'right';
type Rule = {
  /** the atlas it packs into (a texture type has none) */
  group?: string;
  /** texels per view unit at its largest; 1 for things only ever drawn blurred */
  density: number;
  /** sheet: one factor for the sheet (tallest = size); cell: each cell its own size; sequence: one factor per sequence */
  scale: 'sheet' | 'cell' | 'sequence';
  /** longest side in view units at the largest it is drawn (a sheet or cell may say otherwise) */
  size?: number;
  /** sides of its cell a subject may touch (anything else is a cut-through) */
  edges?: Edge[];
  /** may be wide at the bottom (stones, moss): everything else stands on nothing */
  base?: boolean;
  /** what size measures: the longest side (default), or the height (mushrooms: their frames widen as they collapse) */
  measure?: 'height';
  /** drawn larger than life (critters: legs and antennae must read); per-cell cm sizes are multiplied by it */
  zoom?: number;
  /** ink: an ink-and-wash illustration (mushrooms and critters stand out against the photographic world, step 13);
   * kept out of the set grade, which would pull it toward the photographs */
  look?: 'ink';
  /** kept out of the set grade too: its colour is the point (gems; the grade would pull an amethyst toward brown) */
  keep?: boolean;
  /** a ribbon that hangs from above (the canopy's lower edge): attached to the top, the grey background below it */
  hangs?: boolean;
  /** how the cut pipeline treats it */
  kind: 'sprites' | 'growth' | 'textures' | 'ribbon';
};

export const TYPES = {
  mushroom: { group: 'mushrooms', density: 2, scale: 'sequence', measure: 'height', look: 'ink', kind: 'growth' },
  critter: { group: 'critters', density: 2, scale: 'cell', zoom: 5, look: 'ink', kind: 'sprites' },
  plant: { group: 'plants', density: 2, scale: 'sheet', size: cm(30), kind: 'sprites' },
  shrub: { group: 'plants', density: 2, scale: 'cell', size: cm(50), base: true, kind: 'sprites' },
  moss: { group: 'ground', density: 2, scale: 'sheet', size: cm(15), base: true, kind: 'sprites' },
  'moss-strip': { group: 'ground', density: 2, scale: 'cell', size: cm(60), edges: ['left', 'right'], base: true, kind: 'sprites' },
  stone: { group: 'ground', density: 2, scale: 'sheet', size: cm(15), base: true, kind: 'sprites' },
  litter: { group: 'ground', density: 2, scale: 'cell', base: true, kind: 'sprites' },
  inclusion: { group: 'underground', density: 2, scale: 'cell', base: true, kind: 'sprites' },
  gem: { group: 'underground', density: 2, scale: 'cell', base: true, keep: true, kind: 'sprites' },
  deadwood: { group: 'wood', density: 2, scale: 'sequence', kind: 'growth' },
  landmark: { group: 'wood', density: 2, scale: 'cell', base: true, kind: 'sprites' },
  // one type for every tree, whole or leaving the top, living or snapped: the same sprite in every layer, the far ones
  // drawn smaller, blurred and fogged; so it is made for the nearest layer
  tree: { group: 'trees', density: 2, scale: 'cell', size: 900, edges: ['top'], base: true, kind: 'sprites' },
  soil: { density: 1, scale: 'cell', kind: 'textures' },
  // the body of mossy hills: what a moss-covered slope looks like seen from the front, tiled like the soils
  'moss-fill': { density: 1, scale: 'cell', kind: 'textures' },
  ribbon: { density: 1, scale: 'cell', kind: 'ribbon' },
  // the leaf cover over the tree tops: its lower edge (a ribbon hanging from above, mirrored along the top of the
  // view) and the dense foliage above it (tiled like the soils); packed at 2 texels per view unit by their leaf size
  canopy: { density: 2, scale: 'cell', hangs: true, kind: 'ribbon' },
  'leaf-fill': { density: 2, scale: 'cell', kind: 'textures' },
} satisfies Record<string, Rule>;
type TypeName = keyof typeof TYPES;

// ---- prompts ------------------------------------------------------------------------------------------------

const STYLE =
  'Photorealistic macro photographs with a slightly surreal storybook mood, a wild old forest: thick green moss, pale lichen. ' +
  'Soft even overcast daylight from above, neutral white balance, no colour cast, no warm or golden light, nothing glowing. ';
/** Mushrooms and critters (step 13): the look of an old nature field guide, picked over gouache, cel, felt and pencil. */
const INK =
  'A vintage nature field-guide illustration: fine pen and ink outlines and hatching with loose transparent watercolour washes. ' +
  'Neutral even light, no colour cast, nothing glowing. Plain flat even light grey background. ';
const NATURAL = 'Wood is never sawn or cut: tops and ends are snapped, splintered, rotten and weathered. ';
// Models label what they were asked to draw ("Holly aquifolium") unless told not to, every time.
const NO_TEXT = 'No captions, no names, no labels, no words, no numbers, no text of any kind anywhere.';
// A tuft drawn under one frame and not the next stays behind as a stain: the ground is joined at runtime.
// Said once, porcini, parasol, ink cap and the deadwood stubs still came standing in moss: say it as a studio setup.
const NOTHING_UNDER =
  'A studio specimen photograph: each one was lifted out of the ground and photographed alone, nothing under it: ' +
  'no ground, no soil, no moss, no grass, no lichen, no clump of earth, no shadow below it. The plain grey background continues ' +
  'all the way down to the bottom edge of every cell. ';
const NOTHING_UNDER_INK =
  'Nothing under any subject: no ground, no soil, no moss, no grass, no shadow; the plain grey continues down to the bottom edge of every cell. ';
/** The soil of the ground strips and the soil textures, so they match. No roots: tree roots are procedural, like the mycelium. */
const SOIL =
  'dark brown crumbly forest humus with small grey and brown stones and tiny bits of leaf litter, no roots, no root hairs, no white threads';
const STRIP = (top: string) =>
  STYLE +
  'A long horizontal slice of forest floor seen exactly from the side, spanning the full width edge to edge: ' +
  `on top ${top}, below it an even band of ${SOIL}, reaching down to the bottom edge of the image. Seamlessly tileable left and right edges. ` +
  'Above the moss a perfectly plain flat even light grey background. ' +
  NO_TEXT;
/** The leaves of the canopy edges and the leaf fills, so they match: about life size at the focus plane (a beech leaf
 * 8 cm, 30 units), seen from below at a slant like boughs hanging into the view, in the same neutral light. */
const CANOPY = (leaves: string) =>
  STYLE +
  'The lower edge of a dense canopy of tree foliage, seen from the side and a little from below, spanning the full width edge to edge: ' +
  `${leaves}. The dense leaf mass fills the top edge of the image completely, with no gaps along the top; its lower edge hangs down ` +
  'irregularly in sprays of leaves on thin twigs and single dangling leaves, reaching about two thirds of the way down. ' +
  'No trunks, no thick branches, no sky, no light shining through. Seamlessly tileable left and right edges. ' +
  'Below the leaves and in every gap between them a perfectly plain flat even light grey background, down to the bottom edge. ' +
  NO_TEXT;
const GRID = (cols: number, rows: number) =>
  `Arrange them as a sprite sheet: a strict grid of ${cols} columns and ${rows} rows of equal cells, one subject per cell, ` +
  'each complete and centred in its cell with empty space around it, nothing touching or crossing the cell borders, ' +
  'all on one perfectly plain flat even light grey background, no grid lines, no panels, no ground, no shadows. ' +
  NO_TEXT;
/** A mushroom's whole life on one sheet: the same individual grows and decays (ASSETS.md, mushroom). */
const LIFE = (what: string, grow: string, decay: string) =>
  INK +
  `A 12-frame life cycle of one single ${what}, the same individual in every frame, exact side view at eye level, ` +
  'standing on the same spot at the bottom centre of each cell, drawn at the same scale in every frame. ' +
  `Frames 1 to 8 grow: ${grow}; frame 8 is the mature mushroom at full size, filling most of the cell's height. ` +
  `Frames 9 to 12 decay: ${decay}. ` +
  'The stem base ends at the bottom edge of the cell. ' +
  NOTHING_UNDER_INK +
  GRID(4, 3);

// ---- the plan -----------------------------------------------------------------------------------------------

type Sheet = {
  why: string;
  type: TypeName;
  /** empty for an import */
  prompt: string;
  aspect: string;
  /** an import: a picture from an earlier step (samples-relative), kept because it is good; nothing is generated */
  source?: string;
  /** the grid asked for; the slicer still trusts the lines the model drew over it */
  grid: [number, number];
  /** the grid the model actually drew, when it differs and drew no lines to find it by */
  sliced?: [number, number];
  res?: keyof typeof COST;
  /** the matting model, when the default (InSPyReNet) loses the subject: thin grass blades need BiRefNet */
  matte?: 'birefnet';
  /** longest side in view units, instead of the type's */
  size?: number;
  /** cell (grid index) → its longest side in cm, where the model didn't keep real sizes */
  sizes?: Record<number, number>;
  /** sequences by grid index [from, to) and their longest side in view units */
  sequences?: Record<string, { frames: [number, number]; size: number }>;
  /** cells left out, with the reason (what the eye caught) */
  drop?: Record<number, string>;
  /** leaf cover textures (a strip: one; a fill sheet: one per tile): a typical leaf's length in cm and in source texels,
   * measured by eye where strip and fill meet (the strip's dense top). It gives the texture's `s` (view units per texel),
   * so strip and fill draw their leaves the same size: the model draws them at whatever size it likes. */
  leaf?: { cm: number; px: number }[];
  /** superseded or against the rules: kept for the record, not generated or packed */
  retired?: string;
};

function imports(list: Record<string, [string, TypeName, string, Partial<Sheet>?]>): Record<string, Sheet> {
  return Object.fromEntries(
    Object.entries(list).map(([name, [source, type, why, more]]) => [
      name,
      { why, type, prompt: '', aspect: '', source, grid: [1, 1], ...more },
    ]),
  );
}

/** grow 1–8, decay 8–12 (frame 8, the mature one, ends one and starts the other) */
const life = (size: number) => ({
  grow: { frames: [0, 8] as [number, number], size },
  decay: { frames: [7, 12] as [number, number], size },
});

/** Leaf length by tree, in cm. */
const LEAF_CM = { birch: 5, oak: 10, beech: 8, maple: 15 };

export const LIBRARY: Record<string, Sheet> = {
  // -- mushrooms: the life cycle, the heart of the mode ---------------------------------------------------------
  ...imports({
    'life-amanita': [
      '13-styles/raw/inkwash-mushroom.png',
      'mushroom',
      'Fly agaric: the signature mushroom, its size anchors the scale (20 cm, 75 units at most). The ink-and-wash sheet of step 13.',
      { grid: [4, 3], sequences: life(cm(20)) },
    ],
  }),
  'life-porcini': {
    why: 'A fat, slow mushroom: a different rhythm than the fly agaric.',
    type: 'mushroom',
    prompt: LIFE(
      'porcini (cep, Boletus edulis) mushroom',
      'a tiny brown knob, a round button, the bulbous pale stem swelling, the brown cap widening, the cap rounding out, ' +
        'the stem thickening, the cap broadening, a big mature porcini',
      'the cap darkening with soft spots, the cap slumping, the mushroom sinking and splitting, a small soft brown remnant',
    ),
    aspect: '4:3',
    grid: [4, 3],
    sequences: life(cm(16)),
  },
  'life-parasol': {
    why: 'The tallest: a drumstick that opens into an umbrella, the most dramatic growth.',
    type: 'mushroom',
    prompt: LIFE(
      'parasol mushroom (Macrolepiota procera) with a scaly brown cap and a tall snake-patterned stem',
      'a small brown knob, a drumstick shape on a short stem, the stem growing tall with a closed egg-shaped cap, the cap still closed on a very tall stem, ' +
        'the cap starting to open, half open like a bell, nearly flat, the mature parasol with a wide flat cap',
      'the cap edges tearing and drooping, the cap folding down like a broken umbrella, the tall stem leaning and the cap hanging, ' +
        'a fallen broken stem with a crumpled cap',
    ),
    aspect: '4:3',
    grid: [4, 3],
    sequences: life(cm(30)),
  },
  'life-inkcap': {
    why: 'Shaggy ink cap: it decays by melting into black ink, a decay no other mushroom has.',
    type: 'mushroom',
    prompt: LIFE(
      'shaggy ink cap mushroom (Coprinus comatus), white and shaggy',
      'a tiny white pin, a small white bullet shape, a white shaggy cylinder rising, taller, the shaggy white cap elongating on its stem, ' +
        'taller still, the cap at full height, the mature shaggy ink cap, white with a brownish top',
      'the cap edge turning pink then black, the cap edge melting into dripping black ink, most of the cap dissolved into black drips, ' +
        'a bare stem with a small black inky remnant on top',
    ),
    aspect: '4:3',
    grid: [4, 3],
    sequences: life(cm(16)),
  },
  'life-bonnets': {
    why: 'A cluster that grows as a group: thin and fast.',
    type: 'mushroom',
    prompt: LIFE(
      'cluster of seven thin pale bonnet mushrooms (Mycena) growing from one spot',
      'a few white pins, more pins, the thin stems stretching up, small conical caps on them, the stems taller, the caps opening, ' +
        'the caps bell-shaped, a mature tall delicate cluster of seven',
      'the caps browning and curling, the stems bending over, most stems fallen and limp, a few thin collapsed threads',
    ),
    aspect: '4:3',
    grid: [4, 3],
    sequences: life(cm(12)),
  },
  'life-ghost': {
    why: 'The pale translucent ones: the shader makes them glow (night themes, nutrient arrivals).',
    type: 'mushroom',
    prompt: LIFE(
      'small cluster of five pale translucent ghostly white mushrooms with a faint cool tint, not glowing',
      'faint translucent pins, tiny translucent buttons, the stems rising, small round caps, the caps opening, ' +
        'the caps widening, the stems at full height, a mature cluster of pale translucent mushrooms',
      'the caps turning grey and wrinkling, the stems sagging, the cluster collapsing, a few small grey withered remnants',
    ),
    aspect: '4:3',
    grid: [4, 3],
    sequences: life(cm(10)),
  },
  // the photographic lives (generated first, before step 13 chose ink and wash for the living things)
  ...Object.fromEntries(
    ['amanita', 'porcini', 'parasol', 'inkcap', 'bonnets', 'ghost'].map((m) => [
      `photo-life-${m}`,
      retired(`Photographic: mushrooms are ink and wash (step 13).`),
    ]),
  ),
  // retired mushrooms: each grew, decayed, or neither, at its own scale; replaced by the life sheets
  'grow-porcini': retired('Growth only, at 1K: replaced by life-porcini.'),
  'grow-bonnets': retired('Growth only: replaced by life-bonnets.'),
  'grow-glow': retired('Growth only, glow baked into the pixels: replaced by life-ghost.'),
  'decay-amanita': retired(
    'Decay only, a different fly agaric than the growth, ends in a moss tuft with a stain: replaced by life-amanita.',
  ),
  'grow-amanita': retired('Growth from an egg shell: replaced by life-amanita.'),
  'grow-amanita-b': retired('Growth from an egg shell: replaced by life-amanita.'),
  amanita: retired('A static mushroom: every mushroom has a life cycle (the mature frame is the static one).'),
  'glow-cluster': retired('Static, glow baked in.'),
  'pale-cluster': retired('Static: life-bonnets replaces it.'),
  'mushroom-variety': retired('Painted, not photographed, and static.'),

  // -- critters: bodies only, the motion is procedural ---------------------------------------------------------------
  'critters-a': {
    why: 'Legless bodies for the procedural legs, and the snail (the shader crawls it).',
    type: 'critter',
    prompt:
      INK +
      'Eight small creatures seen exactly from the side at eye level, all facing left, drawn as separate puppet bodies WITHOUT ANY LEGS AND WITHOUT ANTENNAE ' +
      '(only head, thorax and abdomen): a black ground beetle, a grey woodlouse with no legs, a red-brown ant, a ladybird, a stag beetle, ' +
      'a long-snouted weevil, a hairy spider body, and a snail with a spiral shell and its soft rounded body stretched out. Seen from the side, not from above. ' +
      // Said once, the ant, ladybird, woodlouse and weevil still came with legs; "the underside is one closed outline" drew an arc under each.
      'Like the parts of a paper puppet whose legs are separate pieces not drawn here: not a single leg anywhere on the sheet, ' +
      'and no line, arc or shadow drawn under the bodies. ' +
      NOTHING_UNDER_INK +
      GRID(4, 2),
    aspect: '16:9',
    grid: [4, 2],
    sizes: { 0: 3, 1: 1.6, 2: 1.2, 3: 1, 4: 4, 5: 1.2, 6: 1.2, 7: 5 },
    drop: { 1: 'Drawn with legs.', 3: 'Drawn with legs.', 5: 'Drawn with legs.' },
  },
  'critters-b': {
    why: 'More legless bodies: variety in shape and colour.',
    type: 'critter',
    prompt:
      INK +
      'Eight small beetles and bugs seen exactly from the side at eye level, all facing left, drawn as separate puppet bodies WITHOUT ANY LEGS AND WITHOUT ANTENNAE ' +
      '(only head, thorax and abdomen): a shiny green-gold ground beetle, a striped shield bug, an earwig, a dark rove beetle, a small round black beetle, ' +
      'a slim click beetle, a round dung beetle, a long longhorn beetle. Seen from the side, not from above. No legs, no antennae, no wings. ' +
      NOTHING_UNDER_INK +
      GRID(4, 2),
    aspect: '16:9',
    grid: [4, 2],
    sizes: { 0: 2.5, 1: 1.4, 2: 2, 3: 1.8, 4: 0.8, 5: 1.5, 6: 2, 7: 3 },
    // it drew 4 x 3: the first six are legless, the rest repeat them with legs
    drop: Object.fromEntries([6, 7, 8, 9, 10, 11].map((i) => [i, 'Drawn with legs or antennae.'])),
  },
  snail: retired('Photographic: critters are ink and wash (step 13); critters-a has the snail.'),
  bodies: retired('Photographic: critters are ink and wash (step 13).'),
  'bodies-b': retired('Photographic: critters are ink and wash (step 13).'),
  'snail-crawl': retired('Eight identical frames: the shader crawls the snail.'),
  critters: retired('Drawn with legs (and a frog, a worm, a centipede): nothing we can animate.'),
  beetle: retired('Drawn with legs: bodies has it without.'),
  moth: retired('Top view with spread wings: no rig for flight.'),

  // -- plants -----------------------------------------------------------------------------------------------------
  plants: {
    why: 'Plants along the ground ribbon, swaying in the shader; break the hard moss edge.',
    type: 'plant',
    matte: 'birefnet',
    prompt:
      STYLE +
      '12 different small forest floor plants, side view, all at one scale true to their real sizes, each growing out of the bottom edge ' +
      'of its cell as if the ground were just below the frame, the stems simply ending at the bottom edge: grass tufts, sedge, wood rush, ' +
      'a small fern, a fern frond unrolling, clover, wood sorrel, a dandelion leaf rosette, dry grass, a seedling, a horsetail, a wood anemone. ' +
      NOTHING_UNDER +
      GRID(4, 3),
    aspect: '4:3',
    grid: [4, 3],
  },
  grass: retired('Most plants sit on a moss or soil clump, some with a grey smear: replaced by plants.'),
  bushes: {
    why: 'Mid-sized cover between trunks and ground; hides the backs of props.',
    type: 'shrub',
    prompt:
      STYLE +
      'Eight different low forest shrubs and clumps, side view, each standing on the bottom of its cell: a blueberry bush, a bramble, ' +
      'a big fern clump, a holly, a young spruce, a dry dead twiggy bush, a moss-covered root clump with plants, a heather. ' +
      GRID(4, 2),
    aspect: '16:9',
    grid: [4, 2],
  },
  moss: {
    why: 'Moss pieces to lay over seams: where a prop meets the ground, where ribbons join, at trunk feet.',
    type: 'moss',
    prompt:
      STYLE +
      '12 different pieces of moss, side view, with soft irregular natural edges: low wide moss cushions, a long flat moss mat, ' +
      'a mossy clump with lichen, moss hanging over an edge with dangling strands, star moss, a cushion with tiny spore stalks, ' +
      'feather moss, a thin creeping strip. ' +
      GRID(4, 3),
    aspect: '4:3',
    grid: [4, 3],
  },
  'moss-strips': {
    why: 'Long horizontal moss edges to drape along ground curves and the tops of logs.',
    type: 'moss-strip',
    prompt:
      STYLE +
      'Three long horizontal strips of moss, each spanning the full width of the image, stacked one above the other with empty space ' +
      'between them: a bumpy cushion moss edge, an edge with moss hanging down in strands, a low feathery edge with tiny plants. ' +
      'Side view. Plain flat even light grey background, no ground. ' +
      NO_TEXT,
    aspect: '16:9',
    grid: [1, 3],
  },

  // -- ground -----------------------------------------------------------------------------------------------------
  stones: {
    why: 'Scatter on and in the ground; small ones as pebbles, big ones to break up the ground line.',
    type: 'stone',
    prompt:
      STYLE +
      '12 different stones, side view: tiny pebbles, flat stones, rounded river stones, a sharp broken rock, two big boulders, ' +
      'some bare grey, some with moss caps or lichen spots, half of them small. ' +
      GRID(4, 3),
    aspect: '4:3',
    grid: [4, 3],
  },
  ...imports({
    rock: [
      '2-assets/rock-seedream-5-lite.png',
      'stone',
      'A mossy stone with lichen: the largest stone (15 cm), not a boulder.',
      { size: cm(15) },
    ],
  }),
  litter: {
    why: 'Things that drop at random from above and settle on the ground: leaves flutter, cones and seeds bounce, samaras spin.',
    type: 'litter',
    prompt:
      STYLE +
      '16 different small things that fall from forest trees, each alone: a green oak leaf, a brown oak leaf, a beech leaf, a yellow maple leaf, ' +
      'a birch leaf, a dry curled leaf, a spruce cone, an open pine cone, an acorn with cap, a beech nut, a hazelnut, a pair of maple seeds with wings, ' +
      'a birch catkin, a small twig with spruce needles, a bare twig, a few red berries on a stalk. ' +
      GRID(4, 4),
    aspect: '1:1',
    grid: [4, 4],
    // as the model drew them: leaves, cones, nuts, seeds, twigs, berries
    sizes: { 0: 10, 1: 10, 2: 8, 3: 12, 4: 6, 5: 7, 6: 12, 7: 6, 8: 2.5, 9: 2.5, 10: 2, 11: 5, 12: 4, 13: 12, 14: 15, 15: 4 },
  },
  inclusions: {
    why: 'Things to scatter in the soil so the underground is not a flat texture: the mycelium winds between them.',
    type: 'inclusion',
    prompt:
      STYLE +
      '12 different small things found buried in forest soil, side view: a pebble, a cluster of small stones, a tangle of fine roots, ' +
      'a thick root piece, an acorn, a beech nut, a curled earthworm, a beetle larva, a buried leaf, a small snail shell, ' +
      'a lump of clay, a piece of rotten wood. ' +
      GRID(4, 3),
    aspect: '4:3',
    grid: [4, 3],
    sizes: { 0: 4, 1: 5, 3: 10, 4: 2.5, 5: 2.5, 6: 8, 7: 3.5, 8: 9, 9: 2.5, 10: 5, 11: 8 },
    drop: { 2: 'The root tangle came out as a speck and a sliver.' },
  },

  treasure: {
    why: 'Buried treasure for the mycelium to find and wind around: a secret under the moss.',
    type: 'inclusion',
    prompt:
      STYLE +
      '16 different old lost treasures as they would be dug out of forest soil, side view, each alone, dirty and weathered, with bits of earth ' +
      'and tiny roots on them: a small wooden treasure chest with iron bands, its lid half open with gold coins inside, a scattered handful of gold coins, ' +
      'a cracked clay pot, a small amphora, a broken rusty sword blade, a rusty dagger, a tarnished silver ring with a red stone, a big rusty iron key, ' +
      'a dented bronze helmet, a leather coin pouch spilling coins, a green glass bottle, a tarnished golden crown with one stone missing, ' +
      'an old brass compass, a rusty lantern, a raw purple crystal, a single big gold coin. All at one scale true to their real sizes. ' +
      GRID(4, 4),
    aspect: '1:1',
    grid: [4, 4],
    // chest, coins, pot, amphora, sword, dagger, ring, key, helmet, pouch, bottle, crown, compass, lantern, crystal, coin
    // storybook proportions, not museum ones: the chest is the prize, the sword a broken blade
    sizes: { 0: 70, 1: 12, 2: 35, 3: 45, 4: 35, 5: 25, 6: 3, 7: 12, 8: 32, 9: 16, 10: 30, 11: 20, 12: 8, 13: 35, 14: 10, 15: 4 },
  },
  remains: {
    why: 'What the forest floor keeps: bones, skulls and fossils for the underground.',
    type: 'inclusion',
    prompt:
      STYLE +
      '16 different old remains as they would be dug out of forest soil, side view, each alone, weathered, stained by earth: ' +
      'a fox skull, a bird skull, a deer antler, a small rib cage of a rabbit, a long thigh bone, a jaw bone with teeth, a vertebra, a scattering of small bones, ' +
      'a spiral ammonite fossil, a trilobite fossil in stone, a fossil fern print in a slab of stone, a mammoth tooth, a shark tooth, ' +
      'a beetle in amber, a turtle shell, a hollow snail shell. All at one scale true to their real sizes. ' +
      GRID(4, 4),
    aspect: '1:1',
    grid: [4, 4],
    // fox skull, bird skull, antler, rib cage, thigh bone, jaw, vertebra, small bones, ammonite, trilobite, fern slab,
    // mammoth tooth, shark tooth, amber, turtle shell, snail shell
    sizes: { 0: 15, 1: 5, 2: 30, 3: 12, 4: 20, 5: 12, 6: 5, 7: 15, 8: 12, 9: 10, 10: 20, 11: 20, 12: 7, 13: 5, 14: 15, 15: 3 },
  },
  crystals: {
    why: 'Raw gemstones in the soil: a rare, bright find among the treasure, in colours nothing else down there has.',
    type: 'gem',
    prompt:
      STYLE +
      '16 different raw gemstones and crystals as they would be dug out of forest soil, side view, each alone, unpolished, ' +
      'with a little earth in their cracks, their colours clear and saturated: half an amethyst geode with deep purple crystals inside, ' +
      'a cluster of amethyst points, a raw ruby, a cluster of dark red garnets, a raw emerald in grey rock, a raw blue sapphire, ' +
      'a cluster of clear quartz points, a smoky quartz point, a chunk of rose quartz, a yellow citrine point, a raw golden topaz, ' +
      'a pale blue aquamarine crystal, a green and pink tourmaline crystal, a piece of opal in brown rock, a lump of blue lapis lazuli, ' +
      'a green jade pebble. All at one scale true to their real sizes. ' +
      GRID(4, 4),
    aspect: '1:1',
    grid: [4, 4],
    // geode, amethyst cluster, ruby, garnets, emerald, sapphire, quartz cluster, smoky quartz, rose quartz, citrine,
    // topaz, aquamarine, tourmaline, opal, lapis, jade
    sizes: { 0: 15, 1: 12, 2: 4, 3: 6, 4: 6, 5: 4, 6: 14, 7: 10, 8: 8, 9: 7, 10: 5, 11: 7, 12: 8, 13: 6, 14: 7, 15: 5 },
  },

  // -- wood -------------------------------------------------------------------------------------------------------
  deadwood: {
    why: 'Wood has a life cycle too: dead stubs and branches rot and fall apart, feeding the mycelium.',
    type: 'deadwood',
    prompt:
      STYLE +
      NATURAL +
      'Two decay sequences in exactly two rows of four, side view, each on the same spot at the bottom centre of its cells, at the same scale in every frame. ' +
      'Top row, 4 frames: a short standing dead tree stub snapped off at the top, then its bark peeling and small bracket fungi appearing, ' +
      'then rotten and split open with chunks falling off, then a low crumbling heap of rotten wood. ' +
      'Bottom row, 4 frames: a fallen dead branch with twigs lying flat, then losing its twigs and bark, then soft, mossy and broken in two, ' +
      'then a few crumbling fragments. ' +
      NOTHING_UNDER +
      GRID(4, 2),
    aspect: '16:9',
    grid: [4, 2],
    // a broken trunk and a whole fallen branch: at 35 and 50 cm they read as twigs next to the mushrooms
    sequences: { stub: { frames: [0, 4], size: cm(80) }, branch: { frames: [4, 8], size: cm(100) } },
  },
  'wood-decay': retired('Every frame stands on a moss tuft: replaced by deadwood.'),
  ...imports({
    // snapped off: half the height of a tree that leaves the top
    snags: ['9-broken/snags.png', 'tree', 'Four dead trees snapped off at different heights.', { grid: [4, 1], size: 450 }],
    stump: ['9-broken/stump.png', 'landmark', 'The stump of jagged rotten splinters.', { size: cm(60) }],
    log: ['9-broken/log.png', 'landmark', 'A fallen log with a torn-up root plate.', { size: cm(80) }],
    roots: ['2-assets/roots-seedream-5-lite.png', 'landmark', 'A mossy root arching like a bridge.', { size: cm(50) }],
  }),

  // -- trees: drawn big, so 4K, two per sheet ---------------------------------------------------------------
  trees: retired('Whole trees at 1K, four in a row: too few pixels per tree. Replaced by trees-a/-b.'),
  'trees-a': {
    why: 'Whole trees, crown to roots (it drew two beech trunks as well).',
    type: 'tree',
    prompt:
      STYLE +
      NATURAL +
      'Two different complete old trees side by side, each whole from the mossy flaring roots at the bottom of its half to the top of the crown: ' +
      'a broad gnarled oak with a wide crown, and a slim tall beech. Side view. ' +
      GRID(2, 1),
    aspect: '1:1',
    grid: [2, 1],
    sliced: [2, 2], // it drew two oaks and two beeches, one above the other
    res: '4K',
  },
  'trees-b': {
    why: 'Whole trees: the dark and the dying ones.',
    type: 'tree',
    prompt:
      STYLE +
      NATURAL +
      'Two different complete trees side by side, each whole from the mossy flaring roots at the bottom of its half to the top: ' +
      'a dark old spruce, and a half-dead tree with a broken-off top, bare grey branches and bracket fungi. Side view. ' +
      GRID(2, 1),
    aspect: '1:1',
    grid: [2, 1],
    res: '4K',
  },
  'trunks-a': {
    why: 'Tall trunks that leave the top of the screen.',
    type: 'tree',
    prompt:
      STYLE +
      'Two different tall old living tree trunks side by side, each rising from mossy flaring roots at the bottom of its half and ' +
      'continuing out of the top edge of the image: a smooth grey beech, a deeply furrowed oak with lichen and moss. Side view. ' +
      'A wide empty gap between them: the roots of the two trunks do not touch. ' +
      GRID(2, 1),
    aspect: '1:1',
    grid: [2, 1],
    res: '4K',
    // Next time one trunk per 9:16 sheet: no grid, no neighbour.
    drop: { 1: 'A grid line drawn behind the trunks (the repair only finds lines drawn over subjects) stays across the oak.' },
  },
  'trunks-b': {
    why: 'More tall trunks.',
    type: 'tree',
    prompt:
      STYLE +
      'Two different tall old tree trunks side by side, each rising from mossy flaring roots at the bottom of its half and ' +
      'continuing out of the top edge of the image: a leaning trunk with a dark hollow, a white birch with peeling bark. Side view. ' +
      GRID(2, 1),
    aspect: '1:1',
    grid: [2, 1],
    res: '4K',
  },
  'trunks-tall': retired('The prototype strip at low resolution, trunks touching: the grid cut through them. The 4K trunks replace it.'),

  // -- textures ---------------------------------------------------------------------------------------------------
  soils: {
    why: 'Fill below the ground ribbon: the same soil as the ground strips, four variants (made seamless locally).',
    type: 'soil',
    prompt:
      STYLE +
      'Four square soil textures in cross-section, as a 2 by 2 grid separated by thin pure white lines, each filling its square ' +
      `completely, evenly lit, flat, no perspective, no objects on top. All four are the same ${SOIL}, in four variants: ` +
      'plain, with more small stones, darker and denser, with a few buried leaf fragments. Each texture seamlessly tileable. ' +
      NO_TEXT,
    aspect: '1:1',
    grid: [2, 2],
  },
  mosses: {
    why: "Fill for mossy hills behind the floor: their body below the strip's moss band (made seamless locally, hex-tiled at runtime).",
    type: 'moss-fill',
    prompt:
      STYLE +
      'Four square textures of a dense forest moss carpet covering a gentle slope, seen straight on from the front, as a 2 by 2 ' +
      'grid separated by thin pure white lines, each filling its square completely with moss, evenly lit, flat, no perspective, ' +
      'no sky, no soil, no stones, no leaves on top. The same small mosses as the ground strips, about 30 cm of moss per square: ' +
      'bright star moss cushions, feather moss with a little grey-green lichen, darker denser moss in the shade, moss with a few ' +
      'tiny clover leaves. Each texture seamlessly tileable. ' +
      NO_TEXT,
    aspect: '1:1',
    grid: [2, 2],
  },
  leaves: {
    why: 'Fill for the leaf cover over the tree tops: its body above the canopy edges (made seamless locally, hex-tiled at runtime).',
    type: 'leaf-fill',
    prompt:
      STYLE +
      'Four square textures of dense tree foliage, looking up into the lower crown from below at a slant, as a 2 by 2 grid separated ' +
      'by thin pure white lines, each filling its square completely with overlapping leaves in several layers at different angles and ' +
      'depths, the deeper layers in darker shade, no sky, no trunks, no branches thicker than a thin twig, evenly lit, ' +
      'no light shining through the leaves. The leaves scattered evenly at their real size, about 60 cm of foliage per square: ' +
      'no leaf, rosette or cluster in the centre stands out, nothing radiates from the middle. ' +
      'One kind of tree per square: small toothed birch leaves, lobed oak leaves, smooth oval beech leaves, five-lobed maple leaves. ' +
      'Each texture seamlessly tileable. ' +
      NO_TEXT,
    aspect: '1:1',
    grid: [2, 2],
    res: '2K',
    // matched to each strip's dense top by eye, side by side at the manifest scale (automatic measures disagreed: step 16)
    leaf: [
      { cm: LEAF_CM.birch, px: 90 },
      { cm: LEAF_CM.oak, px: 150 },
      { cm: LEAF_CM.beech, px: 105 },
      { cm: LEAF_CM.maple, px: 150 },
    ],
  },
  'canopy-birch': {
    why: 'The leaf cover over the tree tops: its lower edge, birch.',
    type: 'canopy',
    prompt: CANOPY('small toothed triangular green birch leaves on thin drooping twigs that hang down in long loose curtains'),
    aspect: '16:9',
    grid: [1, 1],
    res: '2K',
    leaf: [{ cm: LEAF_CM.birch, px: 50 }],
  },
  'canopy-oak': {
    why: 'The leaf cover over the tree tops: its lower edge, oak.',
    type: 'canopy',
    prompt: CANOPY('lobed green oak leaves in dense clusters on short gnarled twigs, a few twigs with grey-green lichen'),
    aspect: '16:9',
    grid: [1, 1],
    res: '2K',
    leaf: [{ cm: LEAF_CM.oak, px: 125 }],
  },
  'canopy-beech': {
    why: 'The leaf cover over the tree tops: its lower edge, beech.',
    type: 'canopy',
    prompt: CANOPY('smooth oval green beech leaves with wavy edges, arranged flat in layered sprays along thin zigzag twigs'),
    aspect: '16:9',
    grid: [1, 1],
    res: '2K',
    leaf: [{ cm: LEAF_CM.beech, px: 130 }],
  },
  'canopy-maple': {
    why: 'The leaf cover over the tree tops: its lower edge, maple.',
    type: 'canopy',
    prompt: CANOPY('large five-lobed green maple leaves on long leaf stalks, overlapping in broad layers, a few winged seed pairs'),
    aspect: '16:9',
    grid: [1, 1],
    res: '2K',
    leaf: [{ cm: LEAF_CM.maple, px: 260 }],
  },
  'soils-roots': retired('Four different soils, full of roots, none matching the ground strip: tree roots are procedural.'),
  'ground-strip-b': {
    why: 'A second ground strip: leafy.',
    type: 'ribbon',
    prompt: STRIP('a carpet of low feather moss with many fallen oak and beech leaves, a few twigs and an acorn'),
    aspect: '16:9',
    grid: [1, 1],
  },
  'ground-strip-c': {
    why: 'A third ground strip: bright moss cushions and lichen.',
    type: 'ribbon',
    prompt: STRIP('cushions of bright star moss and grey-green lichen, tiny ferns and clover sprouting between them'),
    aspect: '16:9',
    grid: [1, 1],
  },
  'ground-strip': {
    why: 'The first ground strip: the look of the prototype ground (step 6), on the same root-free soil as the others.',
    type: 'ribbon',
    prompt: STRIP('a thick bumpy carpet of moss cushions, tiny plants and a few fallen leaves'),
    aspect: '16:9',
    grid: [1, 1],
  },
  'ground-strip-roots': retired('The step-6 strip: roots in its soil (tree roots are procedural) and a warm glow in its background.'),
};

function retired(why: string): Sheet {
  return { why, retired: why, type: 'stone', prompt: '', aspect: '', grid: [1, 1] };
}

// ---- the run ------------------------------------------------------------------------------------------------

const arg = (flag: string) => (process.argv.includes(flag) ? new Set(process.argv[process.argv.indexOf(flag) + 1]!.split(',')) : undefined);
const only = arg('--only');
const regen = arg('--regen') ?? new Set<string>();
const recut = arg('--recut') ?? new Set<string>();
const active = Object.entries(LIBRARY).filter(([, s]) => !s.retired);
const todo = active.filter(([name]) => !only || only.has(name));

// Throw away what is to be made again: the raw sheet (regen only), its cells, and the set's grade.
for (const [name] of active) {
  if (!regen.has(name) && !recut.has(name) && !recut.has('all')) continue;
  const paths = [join(OUT, name), join(OUT, 'graded')];
  if (regen.has(name)) paths.push(join(OUT, 'raw', name + '.png'));
  for (const p of paths) rmSync(p, { recursive: true, force: true });
}

const made = (
  await pool(
    todo.map(([name, s]) => async () => {
      if (s.source) return { name, sheet: s, file: join(SAMPLES, s.source) }; // an import
      const raw = join(OUT, 'raw', name + '.png');
      if (existsSync(raw)) return { name, sheet: s, file: raw }; // accepted
      // 1K is the model's default and stays out of the input.
      const res = s.res && s.res !== '1K' ? { resolution: s.res } : {};
      const [file] = await run(
        'google/nano-banana-2',
        { prompt: s.prompt, aspect_ratio: s.aspect, output_format: 'png', ...res },
        { step: '12-library/raw', name, cost: COST[s.res ?? '1K'] },
      );
      return { name, sheet: s, file: file! };
    }),
    4,
  )
).filter((r) => r !== undefined);

for (const r of made) {
  const dir = join(OUT, r.name);
  const kind = TYPES[r.sheet.type].kind;
  if (kind === 'textures') {
    if (!existsSync(join(dir, 'tile-00.png'))) await Bun.$`uv run --quiet ${MATTE} tiles ${r.file} ${dir} ${r.sheet.grid}`.quiet();
    continue;
  }
  if (kind === 'ribbon') {
    const rule: Rule = TYPES[r.sheet.type];
    const hang = rule.hangs ? ['--hang'] : [];
    if (!existsSync(join(dir, 'ribbon.png')))
      await Bun.$`uv run --quiet ${MATTE} ribbon ${r.file} ${join(dir, 'ribbon.png')} ${hang}`.quiet();
    continue;
  }
  // Cells by the grid the model drew, each matted on its own (matte.py cells); sequence frames share one cell size.
  if (!existsSync(join(dir, 'cells.json'))) {
    // Sequences that are whole rows (deadwood: a stub above, a branch below) each get their own frame size.
    const rows = Object.values(r.sheet.sequences ?? {});
    const perRow =
      rows.length > 1 && rows.every((q) => q.frames[0] % r.sheet.grid[0] === 0 && q.frames[1] - q.frames[0] === r.sheet.grid[0]);
    const growth = kind === 'growth' ? ['--growth', ...(perRow ? ['--rows'] : [])] : [];
    const model = r.sheet.matte ? ['--model', r.sheet.matte] : [];
    const grid = r.sheet.sliced ?? r.sheet.grid;
    console.log((await Bun.$`uv run --quiet ${MATTE} cells ${r.file} ${dir} ${grid} ${growth} ${model}`.text()).trim());
  }
}

// One grade for the whole library: aligned and neutral (the theme colours it at runtime).
const sprites = active
  .filter(([name, s]) => {
    const t: Rule = TYPES[s.type];
    return t.kind !== 'textures' && t.kind !== 'ribbon' && !t.look && !t.keep && existsSync(join(OUT, name));
  })
  .flatMap(([name]) =>
    readdirSync(join(OUT, name))
      .filter((f) => f.startsWith('cell-'))
      .map((f) => join(OUT, name, f)),
  );
if (sprites.length && !existsSync(join(OUT, 'graded')))
  await Bun.$`uv run --quiet ${MATTE} grade set ${join(OUT, 'graded')} ${sprites}`.quiet();

// The plan for the packer: each sheet's type rules, sizes, sequences and drops.
mkdirSync(OUT, { recursive: true });
writeFileSync(
  join(OUT, 'plan.json'),
  JSON.stringify(
    {
      unitsPerCm: UNITS_PER_CM,
      sheets: Object.fromEntries(
        active.map(([name, s]) => {
          const t: Rule = TYPES[s.type];
          return [
            name,
            {
              type: s.type,
              kind: t.kind,
              group: t.group,
              density: t.density,
              scale: t.scale,
              size: s.size ?? t.size,
              measure: t.measure ?? 'longest',
              edges: t.edges ?? [],
              base: t.base ?? false,
              ...(t.hangs && { hangs: true }),
              grid: s.grid,
              ...(s.sizes && { sizes: Object.fromEntries(Object.entries(s.sizes).map(([k, v]) => [k, v * UNITS_PER_CM * (t.zoom ?? 1)])) }),
              ...(s.sequences && { sequences: s.sequences }),
              ...(s.drop && { drop: s.drop }),
              ...(s.leaf && { s: s.leaf.map((l) => +((l.cm * UNITS_PER_CM) / l.px).toFixed(5)) }),
            },
          ];
        }),
      ),
    },
    null,
    1,
  ),
);

for (const r of made) {
  const dir = join(OUT, r.name);
  const files = readdirSync(dir)
    .filter((f) => /^(cell|tile|tiled)-|^ribbon\.png$/.test(f))
    .sort()
    .map((f) => join(dir, f));
  await contact(
    join(OUT, `sheet-${r.name}.webp`),
    `${r.name} (${r.sheet.type}): ${r.sheet.why}`,
    files.map((file) => ({ file, label: basename(file, '.png') })),
    { cols: TYPES[r.sheet.type].kind === 'textures' ? 4 : r.sheet.grid[0] > 2 ? 6 : 2, width: 1400 },
  );
}
console.log(`spent so far: $${spent().toFixed(3)}`);
