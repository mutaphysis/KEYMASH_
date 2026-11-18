// PETRI_ gene transfer: a cell that eats another (or the debris a dead one left) may take up part of
// its genome and become a new species, a hybrid. Pure: the world calls hybridise() with its own rng.
import { GENES, GENE_INDEX, express } from './genome';
import type { Diet, GeneId, Species } from './genome';

/** the chance a cell that hunts (hunter, omni) takes up a diet that doesn't, when its meal offers one: rare, so
 * hunters stay hunters although most of what they eat grazes */
export const LOSE_HUNTING = 0.03;
const HUNTS: Record<Diet, boolean> = { hunter: true, omni: true, grazer: false, photo: false };

/** steps from state a to state b of a gene with `n` states: the short way round for colours */
function delta(kind: 'level' | 'circle' | 'switch', n: number, a: number, b: number): number {
  if (kind !== 'circle') return b - a;
  const r = (((b - a) % n) + n) % n;
  return r > n / 2 ? r - n : r;
}

/** how far two genomes are apart, 0 (the same) … 1 (every gene at the other end): the mean over all genes */
export function genomeDistance(a: Species, b: Species): number {
  let sum = 0;
  GENES.forEach((d, i) => {
    const ga = a.genome[i]!,
      gb = b.genome[i]!;
    if (d.kind === 'switch') sum += ga === gb ? 0 : 1;
    else if (d.kind === 'circle') sum += Math.abs(delta('circle', d.states, ga, gb)) / (d.states / 2);
    else sum += Math.abs(gb - ga) / (d.states - 1);
  });
  return sum / GENES.length;
}

export interface Hybrid {
  sp: Species;
  /** the genes that came from the donor */
  genes: GeneId[];
}

/**
 * The eater `a` takes up 1–3 of the donor's genes that differ from its own: levels and colours move a third to
 * half of the way (at least one step), switches are taken over. Each one may mutate at the eater's mutation rate.
 * A hunting diet is given up for one that doesn't only at LOSE_HUNTING. The main colour always moves toward the
 * donor's, so the hybrid can be told apart. Null when the two share every gene. `taken` says whether a species
 * name is in use.
 */
export function hybridise(a: Species, b: Species, rnd: () => number, taken: (name: string) => boolean): Hybrid | null {
  const ga = a.genome,
    gb = b.genome;
  const keepDiet = HUNTS[a.diet] && !HUNTS[b.diet] && rnd() >= LOSE_HUNTING;
  const open = GENES.map((_, i) => i).filter((i) => ga[i] !== gb[i] && !(keepDiet && i === GENE_INDEX.diet));
  if (!open.length) return null;
  const picked: number[] = [];
  for (let n = 1 + Math.floor(rnd() * 3); n > 0 && open.length; n--) picked.push(open.splice(Math.floor(rnd() * open.length), 1)[0]!);
  const m = a.mutation;
  const g = ga.slice();
  for (const i of picked) {
    const d = GENES[i]!;
    if (d.kind === 'switch') {
      g[i] = rnd() < m * 0.5 ? Math.floor(rnd() * d.states) : gb[i]!;
      continue;
    }
    const k = 1 / 3 + rnd() / 6;
    const dd = delta(d.kind, d.states, ga[i]!, gb[i]!);
    let s = ga[i]! + Math.sign(dd) * Math.max(1, Math.round(Math.abs(dd) * k));
    if (rnd() < m) s += rnd() < 0.5 ? -1 : 1;
    g[i] = d.kind === 'circle' ? ((s % d.states) + d.states) % d.states : Math.max(0, Math.min(d.states - 1, s));
  }
  const hi = GENE_INDEX.hue,
    n = GENES[hi]!.states;
  g[hi] = (g[hi]! + Math.round(delta('circle', n, g[hi]!, gb[hi]!) * (0.3 + rnd() * 0.2)) + n) % n;
  const h = express(g, (rnd() * 2 ** 31) | 0, a.line);
  h.parents = [a, b];
  h.name = hybridName(a, b, rnd, taken);
  return { sp: h, genes: picked.map((i) => GENES[i]!.id) };
}

/** "Genus × epithet": the eater's genus, an epithet spliced from both parents' (botanists write hybrids like this) */
function hybridName(a: Species, b: Species, rnd: () => number, taken: (name: string) => boolean): string {
  const genus = a.name.split(' ')[0]!;
  // the last lowercase word: a name may end in a number (two lines with the same genes) or be a hybrid's
  const epithet = (s: Species) =>
    s.name
      .split(' ')
      .filter((w) => /^[a-z]+$/.test(w))
      .pop() ?? 'mash';
  const epA = epithet(a),
    epB = epithet(b);
  let name = '';
  for (let i = 0; i < 6 && (!name || taken(name)); i++) {
    const head = epA.slice(0, Math.max(2, Math.ceil(epA.length * (0.3 + rnd() * 0.3))));
    let tail = epB.slice(Math.floor(epB.length * (0.3 + rnd() * 0.3)));
    if (/[aeiou]$/.test(head) && /^[aeiou]/.test(tail)) tail = tail.slice(1);
    name = `${genus} × ${head}${tail}`;
  }
  for (let n = 2; taken(name); n++) name = `${genus} × ${epA}${epB} ${n}`;
  return name;
}
