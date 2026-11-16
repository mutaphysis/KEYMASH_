// A tiny Replicate client for the forest look research.
// Every call is cached by its input (never pay twice) and booked in a ledger
// with an estimated price; a call that would push the estimate past BUDGET is refused.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

export const SAMPLES = join(import.meta.dir, 'samples');
const LEDGER = join(SAMPLES, 'ledger.json');
const API = 'https://api.replicate.com/v1';

/** Dollars. The spike had 5 EUR (about $5.40); collecting the real assets added $5 more. The guard stays
 * a little below the total, with room for estimates that run low. */
export const BUDGET = 10.0;

/** Estimated price per run in dollars. Replicate does not publish these through the API,
 * so they are read from the model pages and rounded up. Unknown models are refused. */
export const PRICE: Record<string, number> = {
  'bytedance/seedream-4': 0.03,
  'bytedance/seedream-4.5': 0.04,
  'bytedance/seedream-5-lite': 0.035,
  'google/nano-banana': 0.039,
  'google/nano-banana-2': 0.08,
  'black-forest-labs/flux-1.1-pro': 0.04,
  'black-forest-labs/flux-2-pro': 0.05,
  'black-forest-labs/flux-kontext-pro': 0.04,
  '851-labs/background-remover': 0.001,
  'qwen/qwen-image-layered': 0.05,
};

type Entry = {
  key: string;
  model: string;
  step: string;
  name: string;
  cost: number;
  id?: string;
  status: string;
  files: string[];
  metrics?: unknown;
  at: string;
};

/** Estimated cost of the runs still going, so parallel runs can't overshoot the budget. */
let inFlight = 0;

function ledger(): Entry[] {
  return existsSync(LEDGER) ? (JSON.parse(readFileSync(LEDGER, 'utf8')) as Entry[]) : [];
}

export function spent(): number {
  return ledger().reduce((sum, e) => sum + (e.status === 'succeeded' ? e.cost : 0), 0);
}

function book(e: Entry): void {
  const all = ledger().filter((x) => x.key !== e.key);
  all.push(e);
  mkdirSync(SAMPLES, { recursive: true });
  writeFileSync(LEDGER, JSON.stringify(all, null, 1));
}

function token(): string {
  // bun loads REPLICATE_API_TOKEN=… from .env.local; a bare token pasted into the file works too.
  const env = join(import.meta.dir, '../../.env.local');
  const bare = existsSync(env) ? readFileSync(env, 'utf8').match(/^\s*(r8_\w+)\s*$/m)?.[1] : undefined;
  const t = process.env.REPLICATE_API_TOKEN ?? bare;
  if (!t) throw new Error('REPLICATE_API_TOKEN missing: put it into .env.local');
  return t;
}

async function api(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(path.startsWith('http') ? path : API + path, {
    ...init,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', ...init.headers },
  });
  const body = await res.text();
  // Under $10 credit Replicate allows bursts of 5 predictions: wait and try again.
  if (res.status === 429) {
    await Bun.sleep(1000 * (Number(JSON.parse(body).retry_after) || 5) + Math.random() * 2000);
    return api(path, init);
  }
  if (!res.ok) throw new Error(`${res.status} ${path}: ${body.slice(0, 400)}`);
  return JSON.parse(body);
}

/** A local file as a data URL, so inputs need no upload step. */
export function dataUrl(file: string): string {
  const type = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4' }[
    extname(file).toLowerCase()
  ];
  return `data:${type ?? 'application/octet-stream'};base64,${readFileSync(file).toString('base64')}`;
}

/** The input schema of a model's latest version (to look up parameter names). */
export async function schema(model: string): Promise<any> {
  const m = await api(`/models/${model}`);
  return m.latest_version?.openapi_schema?.components?.schemas?.Input?.properties;
}

/** Official models run by name; community models need their latest version id. */
async function create(model: string, input: Record<string, unknown>): Promise<any> {
  try {
    return await api(`/models/${model}/predictions`, { method: 'POST', headers: { Prefer: 'wait=60' }, body: JSON.stringify({ input }) });
  } catch (err) {
    if (!/\b(404|422)\b/.test(String(err))) throw err;
    const m = await api(`/models/${model}`);
    return api('/predictions', {
      method: 'POST',
      headers: { Prefer: 'wait=60' },
      body: JSON.stringify({ version: m.latest_version.id, input }),
    });
  }
}

function urls(output: unknown): string[] {
  if (typeof output === 'string') return output.startsWith('http') ? [output] : [];
  if (Array.isArray(output)) return output.flatMap(urls);
  if (output && typeof output === 'object') return Object.values(output).flatMap(urls);
  return [];
}

/** Runs a model once per distinct input; outputs land in samples/<step>/<name>[-i].<ext>. */
export async function run(
  model: string,
  input: Record<string, unknown>,
  { step, name, cost }: { step: string; name: string; cost?: number },
): Promise<string[]> {
  const key = createHash('sha256')
    .update(model + JSON.stringify(input))
    .digest('hex')
    .slice(0, 16);
  const cached = ledger().find((e) => e.key === key && e.status === 'succeeded');
  if (cached && cached.files.every((f) => existsSync(join(SAMPLES, f)))) return cached.files.map((f) => join(SAMPLES, f));

  const price = cost ?? PRICE[model];
  if (price === undefined) throw new Error(`no price for ${model}: add it to PRICE first`);
  if (spent() + inFlight + price > BUDGET)
    throw new Error(`budget: $${spent().toFixed(3)} spent, ${model} ($${price}) would pass $${BUDGET}`);

  const started = Date.now();
  inFlight += price;
  let p;
  try {
    p = await create(model, input);
    while (p.status === 'starting' || p.status === 'processing') {
      await Bun.sleep(2000);
      p = await api(p.urls.get);
    }
  } finally {
    inFlight -= price;
  }
  const entry: Entry = {
    key,
    model,
    step,
    name,
    cost: price,
    id: p.id,
    status: p.status,
    files: [],
    metrics: p.metrics,
    at: new Date().toISOString(),
  };
  if (p.status !== 'succeeded') {
    book(entry);
    throw new Error(`${model} ${p.status}: ${p.error ?? ''}`);
  }

  const dir = join(SAMPLES, step);
  mkdirSync(dir, { recursive: true });
  const list = urls(p.output);
  for (const [i, url] of list.entries()) {
    const res = await fetch(url);
    // Some outputs come without an extension in the URL: take it from the content type.
    const type = res.headers.get('content-type')?.split(';')[0] ?? '';
    const ext = extname(new URL(url).pathname) || ('.' + (type.split('/')[1] ?? 'bin')).replace('.quicktime', '.mov');
    const file = join(step, `${name}${list.length > 1 ? `-${i}` : ''}${ext}`);
    writeFileSync(join(SAMPLES, file), new Uint8Array(await res.arrayBuffer()));
    entry.files.push(file);
  }
  book(entry);
  console.log(
    `${model} → ${entry.files.map((f) => basename(f)).join(', ')} (${((Date.now() - started) / 1000).toFixed(0)} s, $${spent().toFixed(3)} spent)`,
  );
  return entry.files.map((f) => join(SAMPLES, f));
}

/** Runs jobs a few at a time; a failed job is logged, not fatal. */
export async function pool<T>(jobs: (() => Promise<T>)[], width = 4): Promise<(T | undefined)[]> {
  const out: (T | undefined)[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: width }, async () => {
      while (next < jobs.length) {
        const i = next++;
        try {
          out[i] = await jobs[i]();
        } catch (err) {
          console.error(String(err));
        }
      }
    }),
  );
  return out;
}
