// Save slots and the draft in localStorage (best-effort), one set per mode.

export interface Demo {
  name: string;
  src: string;
}
export interface Slot {
  name: string;
  src: string;
  t: number;
}

const MODE = 'keymash.mode.v1';
/** KEYMASH_ was the only mode once and keeps its unsuffixed keys */
function keys(mode: string): { slots: string; draft: string } {
  return mode === 'keymash'
    ? { slots: 'keymash.slots.v1', draft: 'keymash.draft.v1' }
    : { slots: `keymash.slots.${mode}.v1`, draft: `keymash.draft.${mode}.v1` };
}

/** a JSON value from localStorage, `def` when missing or unreadable */
export function readJson<T>(k: string, def: T): T {
  try {
    const v = localStorage.getItem(k);
    return v === null ? def : JSON.parse(v);
  } catch (e) {
    return def;
  }
}
/** best-effort: false when localStorage refuses (full, private mode) */
export function writeJson(k: string, v: unknown): boolean {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch (e) {
    return false;
  }
}

export const store = {
  /** id of the last used mode; the caller checks it against the registered modes */
  mode: readJson<string>(MODE, ''),
  setMode(m: string): void {
    this.mode = m;
    writeJson(MODE, m);
  },
  slots(): Slot[] {
    return readJson<Slot[]>(keys(this.mode).slots, []);
  },
  save(src: string): number {
    const slots = this.slots();
    const first = (src.split('\n').find((l) => l.trim()) || 'mash').trim().slice(0, 22);
    slots.unshift({ name: first, src, t: Date.now() });
    const ok = writeJson(keys(this.mode).slots, slots.slice(0, 40));
    return ok ? slots.length : 0;
  },
  remove(i: number): void {
    const s = this.slots();
    s.splice(i, 1);
    writeJson(keys(this.mode).slots, s);
  },
  draft(): string | null {
    return readJson<string | null>(keys(this.mode).draft, null);
  },
  setDraft(src: string): void {
    writeJson(keys(this.mode).draft, src);
  },
};
