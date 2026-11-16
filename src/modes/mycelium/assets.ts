// The pictures MYCELIUM_ draws, downloaded once and decoded off the main thread. assets/ is the forest library
// as scripts/forest/matte/pack.py packs it (manifest.json lists every file and its size); only what the scene
// uses is fetched. The download starts when the mode's code loads, so it runs while the user types; RUN waits
// for it with a byte count on #boot.
import { textures } from './assets/manifest.json';

/** what the scene uses: the ground strip, the strip of the moss hill behind it (star moss, lichen, clover) and the
 * moss carpets of its body, and the soil horizons in layer order (leafy humus is 3, stony 1) */
export const USED = [
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
export type AssetKey = (typeof USED)[number];

const URLS = import.meta.glob<string>(
  ['./assets/tex-ground.webp', './assets/tex-ground-c.webp', './assets/tex-moss-*.webp', './assets/tex-soil-*.webp'],
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
const total = USED.reduce((s, k) => s + textures[k].bytes, 0);

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
      const file = textures[key].file;
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
      // premultiplied here, so the upload needs no conversion and mipmaps don't bleed transparent texels' colour
      out[key] = await createImageBitmap(blob, { premultiplyAlpha: 'premultiply', colorSpaceConversion: 'none' });
    }),
  );
  return out;
}
