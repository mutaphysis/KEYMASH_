// The asset preloader, written to move into src/modes/forest/ as it is: no DOM, no renderer.
//
// Two halves, because they can happen at different times:
// - fetchAssets(): download and decode everything. Start it when the mode is picked: the files load while the
//   user types, decoding (createImageBitmap) runs off the main thread. Progress is in bytes (the manifest knows
//   every file's size), so a bar or #boot line can show a true percentage. One shared promise: asking again
//   returns the same download.
// - uploadAssets(): the GL textures, at RUN when the context exists. Fast; textures larger than the device
//   allows are halved first.

export type Manifest = {
  /** view units per cm at the focus plane (ASSETS.md, Scale) */
  unitsPerCm: number;
  atlases: Record<string, { file: string; w: number; h: number; bytes: number }>;
  /** s: view units per texel (draw at w·s × h·s, the frame's on-screen size); foot: where a ground strip starts, as a
   * fraction of the height (growth frames), the shader fades its sides */
  frames: Record<string, { atlas: string; x: number; y: number; w: number; h: number; ax: number; ay: number; s: number; foot?: number }>;
  sequences: Record<string, readonly string[]>;
  /** wrap: 'mirror' for strips laid along curves (not seamless; repeat mirrored along u, clamped across) */
  textures: Record<string, { file: string; w: number; h: number; bytes: number; wrap?: 'repeat' | 'mirror' }>;
  bytes: number;
};

export type Progress = (loaded: number, total: number) => void;

export type Fetched = { manifest: Manifest; bitmaps: Map<string, ImageBitmap> };

let pending: Promise<Fetched> | undefined;

/** Downloads and decodes every atlas and texture once; `url(file)` maps a file name to its URL. */
export function fetchAssets(manifest: Manifest, url: (file: string) => string, onProgress?: Progress): Promise<Fetched> {
  return (pending ??= download(manifest, url, onProgress));
}

async function download(manifest: Manifest, url: (file: string) => string, onProgress?: Progress): Promise<Fetched> {
  const files = [...Object.values(manifest.atlases), ...Object.values(manifest.textures)];
  const total = files.reduce((s, f) => s + f.bytes, 0);
  let loaded = 0;
  const bitmaps = new Map<string, ImageBitmap>();
  await Promise.all(
    files.map(async (f) => {
      const res = await fetch(url(f.file));
      if (!res.ok || !res.body) throw new Error(`${f.file}: ${res.status}`);
      // Read the stream to count bytes as they arrive.
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        onProgress?.(Math.min(loaded, total), total);
      }
      const blob = new Blob(chunks as BlobPart[], { type: 'image/webp' });
      // Premultiplied here, so the GL upload needs no conversion; colours stay as stored.
      bitmaps.set(f.file, await createImageBitmap(blob, { premultiplyAlpha: 'premultiply', colorSpaceConversion: 'none' }));
    }),
  );
  onProgress?.(total, total);
  return { manifest, bitmaps };
}

export type Uploaded = {
  /** GL texture per atlas and per repeating texture, with its size as uploaded */
  textures: Map<string, { tex: WebGLTexture; w: number; h: number }>;
};

/** Uploads every bitmap as a mipmapped texture; repeating textures wrap, atlases clamp. */
export function uploadAssets(gl: WebGL2RenderingContext, { manifest, bitmaps }: Fetched): Uploaded {
  const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  const textures = new Map<string, { tex: WebGLTexture; w: number; h: number }>();
  const put = (key: string, file: string, wrap: 'clamp' | 'repeat' | 'mirror') => {
    let src: ImageBitmap | OffscreenCanvas = bitmaps.get(file)!;
    let { width: w, height: h } = src;
    // Too big for this device: halve until it fits (frames keep their UVs, which are relative).
    while (w > max || h > max) {
      w >>= 1;
      h >>= 1;
    }
    if (w !== src.width) {
      const c = new OffscreenCanvas(w, h);
      c.getContext('2d')!.drawImage(src, 0, 0, w, h);
      src = c;
    }
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // createImageBitmap already premultiplied; don't let GL do it again.
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    // Soils are made seamless (matte.py tiles): plain repeat, mirroring would add kaleidoscope symmetry.
    // Strips are not seamless: mirrored along their length, clamped across.
    const s = wrap === 'mirror' ? gl.MIRRORED_REPEAT : wrap === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    const t = wrap === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, s);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, t);
    textures.set(key, { tex, w, h });
  };
  for (const [key, a] of Object.entries(manifest.atlases)) put(key, a.file, 'clamp');
  for (const [key, t] of Object.entries(manifest.textures)) put(key, t.file, t.wrap ?? 'repeat');
  return { textures };
}

/** A frame's place in its atlas as UVs (0..1), plus its size in source pixels and its anchor. */
export function frameUV(manifest: Manifest, name: string) {
  const f = manifest.frames[name];
  if (!f) throw new Error(`no frame ${name}`);
  const a = manifest.atlases[f.atlas]!;
  return {
    atlas: f.atlas,
    uv: [f.x / a.w, f.y / a.h, (f.x + f.w) / a.w, (f.y + f.h) / a.h] as [number, number, number, number],
    w: f.w,
    h: f.h,
    anchor: [f.ax, f.ay] as [number, number],
    s: f.s,
    foot: f.foot,
  };
}
