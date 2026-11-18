// Downloads the UI icons from the Iconify API (https://iconify.design/docs/api/) into src/ui/icons/<name>.svg
// and writes src/ui/icons/index.ts, which imports each one via ?url. One set for everything: MingCute,
// filled (soft, rounded shapes; Apache-2.0). The SVGs are committed, so the app needs no network for them.
// A few icons are put together here from two of the set (COMPOSED).
// Usage: bun scripts/ui-icons.ts   — after adding or changing an entry in ICONS or COMPOSED
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
  note: 'document-fill',
  look: 'search-fill',
  kill: 'skull-fill',
  mutate: 'dna-fill',
  divide: 'scissors-fill',
  food: 'leaf-fill',
  stream: 'wave-fill',
  toxin: 'virus-fill',
  light: 'desk-lamp-fill',
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
};

/** our name → `badge` small in the bottom-right corner of a smaller `base`, a gap cut around it; `strike`: struck
 * through, with a gap along the stroke as well (the icons are masks: gaps are transparent, not a colour) */
const COMPOSED: Record<string, { base: string; badge: string; strike?: boolean }> = {
  autoFeed: { base: 'leaf-fill', badge: 'time-fill' },
  autoFeedOff: { base: 'leaf-fill', badge: 'time-fill', strike: true },
};

const ROOT = new URL('..', import.meta.url).pathname;
const DIR = ROOT + 'src/ui/icons/';
mkdirSync(DIR, { recursive: true });

const fetched = new Map<string, Promise<string>>();
/** an icon of the set, fetched once */
function get(icon: string): Promise<string> {
  let p = fetched.get(icon);
  if (!p) {
    p = fetch(`https://api.iconify.design/${SET}/${icon}.svg`).then(async (res) => {
      const svg = await res.text();
      if (!res.ok || !svg.startsWith('<svg')) throw new Error(`${SET}:${icon}: not found (${res.status})`);
      return svg;
    });
    fetched.set(icon, p);
  }
  return p;
}

/** what is inside an icon's <svg> (its viewBox is 0 0 24 24) */
const inner = (svg: string) => svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

async function compose(c: (typeof COMPOSED)[string]): Promise<string> {
  const [base, badge] = await Promise.all([get(c.base), get(c.badge)]);
  // the badge: a 24 unit icon at half size, its middle at (18.5, 18.5); the base shrunk into the top left
  const [bx, by, gap] = [18.5, 18.5, 6.8];
  const strike = c.strike ? `<line x1="3" y1="3" x2="21" y2="21" stroke="#000" stroke-width="5.5" stroke-linecap="round"/>` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">` +
    `<mask id="b" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><rect width="24" height="24" fill="#fff"/>` +
    `<circle cx="${bx}" cy="${by}" r="${gap}" fill="#000"/>${strike}</mask>` +
    `<mask id="s" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><rect width="24" height="24" fill="#fff"/>${strike}</mask>` +
    `<g mask="url(#b)"><g transform="scale(.82)">${inner(base)}</g></g>` +
    `<g mask="url(#s)"><g transform="translate(${bx - 6} ${by - 6}) scale(.5)">${inner(badge)}</g></g>` +
    (c.strike ? `<line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>` : '') +
    `</svg>`
  );
}

const names = [...Object.keys(ICONS), ...Object.keys(COMPOSED)].sort();
const svgs = await Promise.all(
  names.map(async (name) => {
    const c = COMPOSED[name];
    if (!c) return [name, `<!-- ${SET}:${ICONS[name]} -->\n${await get(ICONS[name])}\n`] as const;
    const what = `${SET}:${c.base} + ${SET}:${c.badge}${c.strike ? ', struck through' : ''}`;
    return [name, `<!-- ${what} (composed by scripts/ui-icons.ts) -->\n${await compose(c)}\n`] as const;
  }),
);
// a renamed or dropped icon leaves no file behind
for (const f of readdirSync(DIR)) if (f.endsWith('.svg') && !names.includes(f.slice(0, -4))) rmSync(DIR + f);
for (const [name, svg] of svgs) writeFileSync(DIR + name + '.svg', svg);

writeFileSync(
  DIR + 'index.ts',
  `// Written by \`bun scripts/ui-icons.ts\` (the list lives there): ${SET} icons from Iconify, one URL each.\n` +
    names.map((n) => `import ${n} from './${n}.svg?url';`).join('\n') +
    `\n\nexport const ICONS = { ${names.join(', ')} };\nexport type IconName = keyof typeof ICONS;\n`,
);
execSync(`bunx oxfmt ${DIR}index.ts`, { stdio: 'inherit' });
console.log(`${names.length} icons written to src/ui/icons/`);
