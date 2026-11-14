// oxlint for vite-plugin-checker, with oxfmt riding along: the checker runs this instead of
// `oxlint` (passing `--format json`) and gets one report. Every file oxfmt would change becomes
// a warning pointing at the first line that differs, so formatting shows up in the dev overlay.
import { $ } from 'bun';

interface Diagnostic {
  message: string;
  code: string;
  severity: 'error' | 'warning';
  url?: string;
  help?: string;
  filename: string;
  labels: { span: { offset: number; length: number } }[];
}

const bin = (name: string) => `${import.meta.dir}/../node_modules/.bin/${name}`;
const lint = JSON.parse(await $`${bin('oxlint')} ${process.argv.slice(2)}`.nothrow().quiet().text()) as { diagnostics: Diagnostic[] };

const unformatted = (await $`${bin('oxfmt')} --list-different`.nothrow().quiet().text()).split('\n').filter(Boolean);
for (const file of unformatted) {
  const source = await Bun.file(file).text();
  const formatted = await $`${bin('oxfmt')} --stdin-filepath=${file} < ${Bun.file(file)}`.nothrow().quiet().text();
  let at = 0;
  while (at < source.length && source[at] === formatted[at]) at++;
  const lineStart = source.lastIndexOf('\n', at - 1) + 1;
  const lineEnd = source.indexOf('\n', at);
  lint.diagnostics.push({
    message: 'Not formatted.',
    code: 'oxfmt',
    severity: 'warning',
    help: 'Run `bun run format`.',
    filename: file,
    labels: [{ span: { offset: lineStart, length: Math.max(1, (lineEnd < 0 ? source.length : lineEnd) - lineStart) } }],
  });
}

console.log(JSON.stringify(lint));
