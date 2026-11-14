import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

function gitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return 'nogit'; }
}

// One self-contained index.html: works as a Claude artifact, on GitHub Pages, or opened from disk.
export default defineConfig(({ command }) => ({
  base: './',
  plugins: [vanillaExtractPlugin(), viteSingleFile()],
  build: { target: 'es2022' },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __GIT_SHA__: JSON.stringify(command === 'serve' ? 'dev' : gitSha()),
    __BUILD_NUMBER__: JSON.stringify(process.env.GITHUB_RUN_NUMBER ?? ''),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
}));
