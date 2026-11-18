// Downloads the UI icons from the Iconify API (https://iconify.design/docs/api/) into src/ui/icons/<name>.svg
// and writes src/ui/icons/index.ts, which imports each one via ?url. One set for everything: MingCute,
// filled (soft, rounded shapes; Apache-2.0). The SVGs are committed, so the app needs no network for them.
// Usage: bun scripts/ui-icons.ts   — after adding or changing an entry in ICONS
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const SET = 'mingcute';
/** our name (a JS identifier, also the file name) → the icon's name in the set */
const ICONS: Record<string, string> = {
  play: 'play-fill',
  stop: 'stop-fill',
  paw: 'paw-fill',
  close: 'close-fill',
  undo: 'back-2-fill',
  save: 'save-2-fill',
  open: 'folder-open-fill',
  sheet: 'book-2-fill',
  sound: 'volume-fill',
  mute: 'volume-off-fill',
  share: 'link-fill',
  restart: 'refresh-anticlockwise-1-fill',
  reload: 'refresh-1-fill',
  fullscreen: 'fullscreen-fill',
  fullscreenExit: 'fullscreen-exit-fill',
  edit: 'pencil-fill',
  cookie: 'cookie-fill',
  copy: 'copy-2-fill',
  globe: 'world-2-fill',
  check: 'check-fill',
  left: 'left-fill',
  right: 'right-fill',
  up: 'up-fill',
  down: 'down-fill',
  enter: 'corner-down-left-fill',
  grid: 'grid-fill',
  lab: 'flask-fill',
  hand: 'hand-finger-2-fill',
  look: 'search-fill',
  kill: 'skull-fill',
  mutate: 'dna-fill',
  divide: 'scissors-fill',
  food: 'leaf-fill',
  stream: 'wave-fill',
  toxin: 'virus-fill',
  sweep: 'broom-fill',
  pause: 'pause-fill',
  fast: 'fast-forward-fill',
  breed: 'heart-fill',
  hunter: 'target-fill',
  photo: 'sun-fill',
  omni: 'bowl-fill',
  armor: 'shield-fill',
  glow: 'bulb-fill',
  bond: 'handshake-fill',
  spores: 'mushroom-fill',
  colony: 'group-fill',
  age: 'time-fill',
  hunger: 'battery-2-fill',
  speed: 'run-fill',
  life: 'heartbeat-fill',
  autoFeed: 'leafy-green-fill',
};

const ROOT = new URL('..', import.meta.url).pathname;
const DIR = ROOT + 'src/ui/icons/';
mkdirSync(DIR, { recursive: true });

const names = Object.keys(ICONS).sort();
const svgs = await Promise.all(
  names.map(async (name) => {
    const id = `${SET}:${ICONS[name]}`;
    const res = await fetch(`https://api.iconify.design/${SET}/${ICONS[name]}.svg`);
    const svg = await res.text();
    if (!res.ok || !svg.startsWith('<svg')) throw new Error(`${id}: not found (${res.status})`);
    return [name, `<!-- ${id} -->\n${svg}\n`] as const;
  }),
);
// a renamed or dropped icon leaves no file behind
for (const f of readdirSync(DIR)) if (f.endsWith('.svg') && !(f.slice(0, -4) in ICONS)) rmSync(DIR + f);
for (const [name, svg] of svgs) writeFileSync(DIR + name + '.svg', svg);

writeFileSync(
  DIR + 'index.ts',
  `// Written by \`bun scripts/ui-icons.ts\` (the list lives there): ${SET} icons from Iconify, one URL each.\n` +
    names.map((n) => `import ${n} from './${n}.svg?url';`).join('\n') +
    `\n\nexport const ICONS = { ${names.join(', ')} };\nexport type IconName = keyof typeof ICONS;\n`,
);
execSync(`bunx oxfmt ${DIR}index.ts`, { stdio: 'inherit' });
console.log(`${names.length} icons written to src/ui/icons/`);
