// The pictures MYCELIUM_ draws, downloaded once and decoded off the main thread. assets/ is the forest library
// as scripts/forest/matte/pack.py packs it (manifest.json lists every file and its size); only what the scene
// uses is fetched. The download starts when the mode's code loads, so it runs while the user types; RUN waits
// for it with a byte count on #boot.
import { atlases, frames, textures } from './assets/manifest.json';

/** what the scene uses: the ground strip, the strip of the moss hill behind it (star moss, lichen, clover) and the
 * moss carpets of its body, and the soil horizons in layer order (leafy humus is 3, stony 1) */
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
] as const satisfies readonly (keyof typeof textures)[];
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
/** the tree the scene stands (render.ts places it), and its page */
export const TREE = 'trees-a/03' satisfies keyof typeof frames;
export const TREE_PAGE = PAGES[frames[TREE].atlas]!;
const TREE_RELIEF = TREE_PAGE.relief;
if (!TREE_RELIEF) throw new Error(`${TREE_PAGE.file}: no relief (re-run scripts/forest/matte/pack.py)`);

const USED = [...TEXTURES, ...ATLASES, 'tree', 'tree-relief'] as const;
export type AssetKey = (typeof USED)[number];

const FILES: Record<AssetKey, { file: string; bytes: number }> = { ...textures, ...atlases, tree: TREE_PAGE, 'tree-relief': TREE_RELIEF };

const URLS = import.meta.glob<string>(
  [
    './assets/tex-ground.webp',
    './assets/tex-ground-c.webp',
    './assets/tex-moss-*.webp',
    './assets/tex-soil-*.webp',
    './assets/atlas-underground-0.webp',
    './assets/atlas-ground-0.webp',
    // every tree page and its relief: the URLs only, a scene fetches the trees it shows
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
export type Progress = (loaded: number, total: number) => void;

let pending: Promise<Assets> | undefined;
let loaded = 0;
const listeners = new Set<Progress>();
const total = USED.reduce((s, k) => s + FILES[k].bytes, 0);

/** every picture the scene uses, decoded; asking again returns the same download (a failed one is tried again) */
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
    USED.map(async (key) => {
      const file = FILES[key].file;
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
        loaded = Math.min(total, loaded + value.length);
        for (const l of listeners) l(loaded, total);
      }
      const blob = new Blob(chunks as BlobPart[], { type: 'image/webp' });
      // premultiplied here, so the upload needs no conversion and mipmaps don't bleed transparent texels' colour (a
      // relief is opaque: unchanged by it)
      out[key] = await createImageBitmap(blob, { premultiplyAlpha: 'premultiply', colorSpaceConversion: 'none' });
    }),
  );
  return out;
}
