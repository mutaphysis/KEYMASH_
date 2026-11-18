// The lab's specimen drawer: the eight body types, always there, then the ones you kept (newest first),
// stored as their gene sequences, so an older sequence still reads when genes are added later.
import { BODIES, decodeGenome, encodeGenome, specimen, typeGenome } from '../genome';
import type { Species } from '../genome';
import { readJson, writeJson } from '../../../ui/storage';

const KEY = 'keymash.lab.petri.v1';
/** at most this many kept specimens */
const MAX = 40;

export interface Entry {
  sp: Species;
  builtIn: boolean;
  /** when it was kept (ms); 0 for the built-ins */
  t: number;
}

export class Specimens {
  readonly entries: Entry[];

  constructor() {
    const kept = readJson<{ seq: string; t: number }[]>(KEY, []);
    this.entries = [
      ...BODIES.map((b) => ({ sp: specimen(typeGenome(b)), builtIn: true, t: 0 })),
      ...(Array.isArray(kept) ? kept : [])
        .filter((k) => typeof k?.seq === 'string')
        .sort((a, b) => b.t - a.t)
        .slice(0, MAX)
        .map((k) => ({ sp: specimen(decodeGenome(k.seq)), builtIn: false, t: Number(k.t) || 0 })),
    ];
  }

  /** keep a specimen; false when the drawer has those genes already */
  add(sp: Species): boolean {
    const seq = encodeGenome(sp.genome);
    if (this.entries.some((e) => encodeGenome(e.sp.genome) === seq)) return false;
    const first = this.entries.findIndex((e) => !e.builtIn);
    this.entries.splice(first < 0 ? this.entries.length : first, 0, { sp, builtIn: false, t: Date.now() });
    const customs = this.entries.filter((e) => !e.builtIn);
    if (customs.length > MAX) this.entries.splice(this.entries.indexOf(customs[customs.length - 1]!), 1);
    this.save();
    return true;
  }

  remove(entry: Entry): void {
    const i = this.entries.indexOf(entry);
    if (i < 0 || entry.builtIn) return;
    this.entries.splice(i, 1);
    this.save();
  }

  /** new genes for a kept specimen; it keeps its place */
  replace(entry: Entry, sp: Species): void {
    if (entry.builtIn) return;
    entry.sp = sp;
    this.save();
  }

  private save(): void {
    writeJson(
      KEY,
      this.entries.filter((e) => !e.builtIn).map((e) => ({ seq: encodeGenome(e.sp.genome), t: e.t })),
    );
  }
}
