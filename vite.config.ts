import { defineConfig, type Plugin } from 'vite';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import checker from 'vite-plugin-checker';
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The modes a build ships; `bun run dev` has every mode. The header cycles through them in the
// order of src/modes/index.ts.
const BUILD_MODES = ['keymash', 'petri'];

// The registry's import of every other mode resolves to `export const <id> = null` in a build, so
// none of its code, styles or assets (nor the chunk of its dynamic import) reach dist/.
function onlyModes(): Plugin {
  const registry = fileURLToPath(new URL('./src/modes/index.ts', import.meta.url));
  const all = readdirSync(new URL('./src/modes', import.meta.url), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  for (const id of BUILD_MODES) if (!all.includes(id)) throw new Error(`BUILD_MODES: no mode '${id}' in src/modes/`);
  const dropped = all.filter((id) => !BUILD_MODES.includes(id));
  const STUB = '\0dropped-mode:';
  return {
    name: 'only-modes',
    apply: 'build',
    enforce: 'pre',
    resolveId(source, importer) {
      const id = source.slice(2);
      return importer === registry && source.startsWith('./') && dropped.includes(id) ? STUB + id : null;
    },
    load(id) {
      return id.startsWith(STUB) ? `export const ${id.slice(STUB.length)} = null;` : null;
    },
  };
}

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

function gitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'nogit';
  }
}

// Built for GitHub Pages: a small index.html + main chunk, every mode a chunk of its own (fetched
// on first use), pictures and fonts as files. Needs to be served over http(s), not opened from disk.
// `bun run dev` checks as you type: TypeScript, oxlint and oxfmt (scripts/checker-lint.ts merges
// both into one report) show in the terminal and the in-page overlay, which starts closed (its badge
// opens it), so it doesn't cover the stage. CI runs them separately, so the build skips them.
// Vite DevTools (dock on Shift+Alt+D, /__devtools/) has a checker panel too.
// `bun run analyze` builds and then serves the bundle analyzer (DevTools for Rolldown).
export default defineConfig(({ command, mode }) => ({
  base: './',
  plugins: [
    vanillaExtractPlugin(),
    onlyModes(),
    checker({
      enableBuild: false,
      overlay: { initialIsOpen: false },
      typescript: true,
      oxlint: { lintCommand: 'bun scripts/checker-lint.ts', watchPath: ['src', 'test', 'index.html', 'vite.config.ts'] },
    }),
  ],
  devtools: mode === 'analyze' ? { apply: 'build' } : { apply: 'serve', embeddedVisibility: 'passive' },
  build: { target: 'es2022' },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __GIT_SHA__: JSON.stringify(command === 'serve' ? 'dev' : gitSha()),
    __BUILD_NUMBER__: JSON.stringify(process.env.GITHUB_RUN_NUMBER ?? ''),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
}));
