// bun run build.js -> dist/index.html (one self-contained page)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const res = await Bun.build({ entrypoints: ['./src/main.js'], minify: true, target: 'browser', format: 'iife' });
if (!res.success) { console.error(res.logs); process.exit(1); }
const js = await res.outputs[0].text();
const css = readFileSync('./src/style.css', 'utf8');
let html = readFileSync('./src/index.html', 'utf8');
html = html.replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => js.replace(/<\/script/gi, '<\\/script'));
mkdirSync('./dist', { recursive: true });
writeFileSync('./dist/index.html', html);
console.log(`dist/index.html  ${(html.length / 1024).toFixed(1)} KB`);
