// The pictures MYCELIUM_ draws, downloaded once and decoded off the main thread. assets/ is the forest library
// as scripts/forest/matte/pack.py packs it (manifest.json lists every file and its size); only what the scene
// uses is fetched. The download starts when the mode's code loads, so it runs while the user types; RUN waits
// for it with a byte count on #boot.
import { atlases, frames, textures } from './assets/manifest.json';
import { LEAVES, TRUNKS } from './trees';

/** what the scene uses: the ground strip, the strip of the moss hill behind it (star moss, lichen, clover) and the
 * moss carpets of its body, the soil horizons in layer order (leafy humus is 3, stony 1), and the crowns' leaf cover:
 * every kind's hanging canopy edge and its leaf fill (the fills come in the strips' order: birch, oak, beech, maple) */
const TEXTURES = [
  'ground',
  'ground-c',
  'moss-0',
  'moss-1',
  'moss-2',
  'moss-3',
  'soil-0',
  'soil-1',
  'soil-2',
  'soil-3',
  'canopy-birch',
  'canopy-oak',
  'canopy-beech',
  'canopy-maple',
  'leaf-0',
  'leaf-1',
  'leaf-2',
  'leaf-3',
] as const satisfies readonly (keyof typeof textures)[];
/** each kind of leaves (trees.ts: LEAVES), as the manifest has them (`s`: view units per texel, so the strip's and
 * the fill's leaves match): its canopy strip and its leaf fill, and their keys */
export const CANOPIES = LEAVES.map((k) => `canopy-${k}` as const);
export const LEAF_FILLS = LEAVES.map((_, i) => `leaf-${i}` as 'leaf-0' | 'leaf-1' | 'leaf-2' | 'leaf-3');
export const CANOPY = CANOPIES.map((k) => textures[k]);
export const LEAF_FILL = LEAF_FILLS.map((k) => textures[k]);
/** and the atlases of what lies buried (buried.ts): treasure and pebbles, and the stones */
export const ATLASES = ['underground-0', 'ground-0'] as const satisfies readonly (keyof typeof atlases)[];
export type AtlasKey = (typeof ATLASES)[number];

/** a page of an atlas; tree pages hold one tree each, with its relief (normal, depth) beside it in the same layout */
export interface Page {
  file: string;
  w: number;
  h: number;
  bytes: number;
  relief?: { file: string; bytes: number };
}
const PAGES: Record<string, Page> = atlases;
/** the trunks' pages (trees.ts: TRUNKS, in its order) with their reliefs; a forest fetches only the trunks it shows */
export const TREE_PAGES = TRUNKS.map((f) => PAGES[frames[f].atlas]!);
const RELIEFS = TREE_PAGES.map((p) => {
  if (!p.relief) throw new Error(`${p.file}: no relief (re-run scripts/forest/matte/pack.py)`);
  return p.relief;
});

export type AssetKey = (typeof TEXTURES)[number] | AtlasKey;
/** a file to fetch, and its size */
type Source = { file: string; bytes: number };
const USED: [AssetKey, Source][] = [
  ...TEXTURES.map((k): [AssetKey, Source] => [k, textures[k]]),
  ...ATLASES.map((k): [AssetKey, Source] => [k, atlases[k]]),
];

const URLS = import.meta.glob<string>(
  [
    './assets/tex-ground.webp',
    './assets/tex-ground-c.webp',
    './assets/tex-moss-*.webp',
    './assets/tex-soil-*.webp',
    './assets/tex-canopy-*.webp',
    './assets/tex-leaf-*.webp',
    './assets/atlas-underground-0.webp',
    './assets/atlas-ground-0.webp',
    // every tree page and its relief: the URLs only, a forest fetches the trunks it shows
    './assets/atlas-trees-*.webp',
    './assets/relief-trees-*.webp',
  ],
  {
    eager: true,
    query: '?url',
    import: 'default',
  },
);

export type Assets = Record<AssetKey, ImageBitmap>;
/** a trunk's picture and its relief */
export type Trunk = { picture: ImageBitmap; relief: ImageBitmap };
export type Progress = (loaded: number, total: number) => void;

let pending: Promise<Assets> | undefined;
let loaded = 0;
const listeners = new Set<Progress>();
const total = USED.reduce((s, [, f]) => s + f.bytes, 0);

/** every picture the scene uses but the trunks, decoded; asking again returns the same download (a failed one is
 * tried again) */
export function fetchAssets(onProgress?: Progress): Promise<Assets> {
  if (onProgress) {
    listeners.add(onProgress);
    onProgress(loaded, total);
  }
  pending ??= download().catch((e: unknown) => {
    pending = undefined;
    loaded = 0;
    throw e;
  });
  const p = pending;
  if (onProgress) void p.finally(() => listeners.delete(onProgress)).catch(() => {});
  return p;
}

async function download(): Promise<Assets> {
  const out = {} as Assets;
  await Promise.all(
    USED.map(async ([key, { file }]) => {
      out[key] = await bitmap(file, (n) => {
        loaded = Math.min(total, loaded + n);
        for (const l of listeners) l(loaded, total);
      });
    }),
  );
  return out;
}

/** trunks by index into TRUNKS, each downloaded once (a failed one is tried again next time) */
const trunks = new Map<number, Promise<Trunk>>();

/** the trunks `ids` (TRUNKS indices; repeats are fine), decoded, by index; `onProgress` counts their bytes, those
 * already here included */
export async function fetchTrunks(ids: readonly number[], onProgress?: Progress): Promise<Map<number, Trunk>> {
  const want = [...new Set(ids)];
  const size = want.reduce((s, i) => s + TREE_PAGES[i]!.bytes + RELIEFS[i]!.bytes, 0);
  let got = 0;
  const count = (n: number) => {
    got = Math.min(size, got + n);
    onProgress?.(got, size);
  };
  const done = await Promise.all(
    want.map(async (i) => {
      let p = trunks.get(i);
      if (p) {
        const t = await p;
        count(TREE_PAGES[i]!.bytes + RELIEFS[i]!.bytes);
        return [i, t] as const;
      }
      p = Promise.all([bitmap(TREE_PAGES[i]!.file, count), bitmap(RELIEFS[i]!.file, count)]).then(([picture, relief]) => ({
        picture,
        relief,
      }));
      trunks.set(i, p);
      p.catch(() => trunks.delete(i));
      return [i, await p] as const;
    }),
  );
  return new Map(done);
}

/** one of the library's files, decoded; `onBytes` hears every chunk as it arrives */
async function bitmap(file: string, onBytes: (n: number) => void): Promise<ImageBitmap> {
  const url = URLS[`./assets/${file}`];
  if (!url) throw new Error(`${file}: not bundled`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${file}: ${res.status}`);
  // read as a stream to count bytes as they arrive
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    onBytes(value.length);
  }
  const blob = new Blob(chunks as BlobPart[], { type: 'image/webp' });
  // premultiplied here, so the upload needs no conversion and mipmaps don't bleed transparent texels' colour (a
  // relief is opaque: unchanged by it)
  return createImageBitmap(blob, { premultiplyAlpha: 'premultiply', colorSpaceConversion: 'none' });
}
