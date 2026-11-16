// Slices a cut-out sprite sheet (RGBA) into cells: the grid comes from the empty gutters in the
// alpha channel, so it works whatever grid the model actually drew. Inside a cell, specks and label
// letters (small components) are dropped. All cells of a sheet share one size and the subject sits on
// the cell's bottom centre, so animation frames line up.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';

export type Cell = { file: string; x: number; y: number; w: number; h: number };

let chrome: Browser | undefined;
let page: Page | undefined;
async function browser(): Promise<Page> {
  if (!page) page = await (chrome = await chromium.launch()).newPage();
  return page;
}
/** Closes the browser; without this the script never exits. */
export async function closeSlicer(): Promise<void> {
  await chrome?.close();
  chrome = page = undefined;
}

export async function slice(sheet: string, outDir: string, prefix: string): Promise<Cell[]> {
  const p = await browser();
  const src = `data:image/png;base64,${readFileSync(sheet).toString('base64')}`;
  const cells = await p.evaluate(async (src: string) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const { width: W, height: H } = img;
    const c = new OffscreenCanvas(W, H);
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const px = g.getImageData(0, 0, W, H).data;
    const solid = (x: number, y: number) => px[(y * W + x) * 4 + 3]! > 24;

    // Runs of rows / columns that hold something, separated by gutters at least 1 % wide.
    const runs = (n: number, m: number, at: (i: number, j: number) => boolean) => {
      const full: boolean[] = [];
      for (let i = 0; i < n; i++) {
        let k = 0;
        for (let j = 0; j < m; j++) if (at(i, j)) k++;
        full.push(k > 1);
      }
      const out: [number, number][] = [];
      const gap = Math.max(4, n * 0.01);
      let start = -1,
        last = -1;
      for (let i = 0; i < n; i++) {
        if (!full[i]) continue;
        if (start < 0) start = i;
        else if (i - last > gap) {
          out.push([start, last]);
          start = i;
        }
        last = i;
      }
      if (start >= 0) out.push([start, last]);
      return out;
    };
    // Rows of name labels (models write them despite "no text") are much flatter than rows of subjects.
    const all = runs(H, W, (y, x) => solid(x, y));
    const tallest = Math.max(...all.map(([a, b]) => b - a));
    const rows = all.filter(([a, b]) => b - a > tallest * 0.3);
    const result: { x: number; y: number; w: number; h: number; data: string }[] = [];
    const boxes: { x0: number; y0: number; x1: number; y1: number; n: number }[] = [];
    for (const [y0, y1] of rows) {
      const cols = runs(W, y1 - y0 + 1, (x, j) => solid(x, y0 + j));
      for (const [x0, x1] of cols) {
        // Connected components inside the cell; keep those at least 8 % of the biggest.
        const w = x1 - x0 + 1,
          h = y1 - y0 + 1;
        const label = new Int32Array(w * h).fill(-1);
        const comps: { n: number; x0: number; y0: number; x1: number; y1: number }[] = [];
        for (let j = 0; j < h; j++)
          for (let i = 0; i < w; i++) {
            if (label[j * w + i]! >= 0 || !solid(x0 + i, y0 + j)) continue;
            const id = comps.length;
            const comp = { n: 0, x0: i, y0: j, x1: i, y1: j };
            const stack = [j * w + i];
            label[j * w + i] = id;
            while (stack.length) {
              const k = stack.pop()!;
              const ci = k % w,
                cj = (k / w) | 0;
              comp.n++;
              comp.x0 = Math.min(comp.x0, ci);
              comp.x1 = Math.max(comp.x1, ci);
              comp.y0 = Math.min(comp.y0, cj);
              comp.y1 = Math.max(comp.y1, cj);
              for (const [di, dj] of [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
              ]) {
                const ni = ci + di!,
                  nj = cj + dj!;
                if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
                const nk = nj * w + ni;
                if (label[nk]! >= 0 || !solid(x0 + ni, y0 + nj)) continue;
                label[nk] = id;
                stack.push(nk);
              }
            }
            comps.push(comp);
          }
        const big = Math.max(...comps.map((q) => q.n));
        const keep = comps.filter((q) => q.n >= big * 0.08);
        if (!keep.length || big < 200) continue;
        const box = {
          x0: x0 + Math.min(...keep.map((q) => q.x0)),
          y0: y0 + Math.min(...keep.map((q) => q.y0)),
          x1: x0 + Math.max(...keep.map((q) => q.x1)),
          y1: y0 + Math.max(...keep.map((q) => q.y1)),
          keep: new Set(keep.map((q) => comps.indexOf(q))),
          n: keep.reduce((sum, q) => sum + q.n, 0),
          label,
          cx0: x0,
          cy0: y0,
          cw: w,
        };
        boxes.push(box);
        (box as any).mask = (x: number, y: number) => {
          const l = label[(y - y0) * w + (x - x0)]!;
          return l >= 0 && box.keep.has(l);
        };
      }
    }
    // Stray bits that survive as cells of their own hold far fewer pixels than a subject.
    const median = boxes.map((b) => b.n).sort((a, b) => a - b)[boxes.length >> 1] ?? 0;
    boxes.splice(0, boxes.length, ...boxes.filter((b) => b.n >= median * 0.2));
    // One cell size for the whole sheet, subject on the bottom centre.
    const cw = Math.max(...boxes.map((b) => b.x1 - b.x0 + 1)) + 8;
    const ch = Math.max(...boxes.map((b) => b.y1 - b.y0 + 1)) + 8;
    for (const b of boxes) {
      const bw = b.x1 - b.x0 + 1,
        bh = b.y1 - b.y0 + 1;
      const out = new OffscreenCanvas(cw, ch);
      const o = out.getContext('2d')!;
      const part = g.getImageData(b.x0, b.y0, bw, bh);
      const mask = (b as any).mask as (x: number, y: number) => boolean;
      for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) if (!mask(b.x0 + i, b.y0 + j)) part.data[(j * bw + i) * 4 + 3] = 0;
      const dx = Math.round((cw - bw) / 2),
        dy = ch - 4 - bh;
      o.putImageData(part, dx, dy);
      const blob = await out.convertToBlob({ type: 'image/png' });
      const data = await new Promise<string>((ok) => {
        const r = new FileReader();
        r.onload = () => ok(r.result as string);
        r.readAsDataURL(blob);
      });
      result.push({ x: dx, y: dy, w: bw, h: bh, data });
    }
    return result;
  }, src);

  mkdirSync(outDir, { recursive: true });
  return cells.map((c, i) => {
    const file = join(outDir, `${prefix}-${String(i).padStart(2, '0')}.png`);
    writeFileSync(file, Buffer.from(c.data.split(',')[1]!, 'base64'));
    return { file, x: c.x, y: c.y, w: c.w, h: c.h };
  });
}
