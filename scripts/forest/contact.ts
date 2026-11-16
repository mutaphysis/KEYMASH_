// Contact sheets: tiles labelled images into one picture to look at (and to show).
// Transparent images sit on a checkerboard, so cut-out edges are easy to judge.
// Usage: bun scripts/forest/contact.ts <out.webp> <title> <img>...   (or import contact())

import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { chromium } from 'playwright-core';

export type Tile = { file: string; label?: string };

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

const esc = (s: string) => s.replace(/[&<>]/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt' }[c]};`);

export async function contact(out: string, title: string, tiles: Tile[], { cols = 4, width = 1600, bg = 'dark' } = {}): Promise<string> {
  const cells = tiles
    .map((t) => {
      const src = `data:${MIME[extname(t.file).toLowerCase()] ?? 'image/png'};base64,${readFileSync(t.file).toString('base64')}`;
      return `<figure><div class="img"><img src="${src}"></div><figcaption>${esc(t.label ?? basename(t.file))}</figcaption></figure>`;
    })
    .join('');
  const html = `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; padding: 16px; width: ${width - 32}px; background: ${bg === 'dark' ? '#16130f' : '#eee'}; color: #d8cdb8;
      font: 14px/1.3 ui-monospace, monospace; }
    h1 { font-size: 18px; margin: 0 0 12px; }
    main { display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 12px; }
    figure { margin: 0; }
    .img { background: repeating-conic-gradient(#3a342c 0 25%, #2a251f 0 50%) 0 0 / 20px 20px; aspect-ratio: auto; }
    img { display: block; width: 100%; height: auto; }
    figcaption { padding: 4px 0; white-space: pre-wrap; }
  </style><h1>${esc(title)}</h1><main>${cells}</main>`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  await page.setContent(html, { waitUntil: 'load' });
  const png = await page.screenshot({ fullPage: true, type: 'png' });
  await browser.close();
  // WebP keeps the sheets small; cwebp is installed via Homebrew.
  const tmp = out.replace(/\.webp$/, '.png');
  await Bun.write(tmp, png);
  await Bun.$`cwebp -quiet -q 82 ${tmp} -o ${out}`;
  await Bun.$`rm ${tmp}`;
  return out;
}

if (import.meta.main) {
  const [out, title, ...files] = process.argv.slice(2);
  if (!out || !title || !files.length) throw new Error('usage: contact.ts <out.webp> <title> <img>...');
  console.log(
    await contact(
      out,
      title,
      files.map((file) => ({ file })),
    ),
  );
}
