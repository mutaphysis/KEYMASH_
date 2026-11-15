// PETRI_ gene transfer: a cell that eats another (or the debris a dead one left) may take up part of
// its genome and become a new species, a hybrid. Pure: the world calls hybridise() with its own rng.
import { BODIES, DIETS } from './genome';
import type { Species } from './genome';

/** genes with a range: a meal moves them part of the way toward the donor's value */
const RANGE = {
  size: [5, 40],
  speed: [3, 80],
  sense: [40, 400],
  agility: [0.6, 4],
  toxic: [0, 1],
  armor: [0, 0.9],
  glow: [0, 1],
  colony: [0, 1],
  divideAt: [20, 400],
  life: [40, 200],
  mutation: [0.02, 0.5],
  sat: [40, 95],
  wobble: [0.1, 1.2],
  organelles: [1, 8],
  lobes: [2, 7],
  flagella: [0, 3],
} as const;
type RangeGene = keyof typeof RANGE;
/** counted genes: whole numbers only */
const WHOLE: Partial<Record<RangeGene, true>> = { organelles: true, lobes: true, flagella: true };
/** genes taken over as they are */
const SWITCH = ['body', 'diet', 'spores', 'symbiosis', 'cilia'] as const;
type SwitchGene = (typeof SWITCH)[number];
export type Gene = RangeGene | SwitchGene | 'hue2';
const GENES: Gene[] = [...(Object.keys(RANGE) as RangeGene[]), ...SWITCH, 'hue2'];

const isRange = (g: Gene): g is RangeGene => g in RANGE;
const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.max(lo, Math.min(hi, v));
/** a share of the way from angle a to angle b (degrees, the short way round) */
const towardAngle = (a: number, b: number, k: number) => (a + (((((b - a) % 360) + 540) % 360) - 180) * k + 360) % 360;

function differs(a: Species, b: Species, g: Gene): boolean {
  if (g === 'hue2') return Math.abs(towardAngle(a.hue2, b.hue2, 1) - a.hue2) > 5;
  if (isRange(g)) return Math.abs(a[g] - b[g]) > (RANGE[g][1] - RANGE[g][0]) * 0.02;
  return a[g] !== b[g];
}

/** how far two genomes are apart, 0 (the same) … 1 (every gene at the other end): the mean over all genes */
export function genomeDistance(a: Species, b: Species): number {
  let sum = 0;
  for (const g of GENES) {
    if (g === 'hue2') sum += Math.abs(((((b.hue2 - a.hue2) % 360) + 540) % 360) - 180) / 180;
    else if (isRange(g)) sum += Math.min(1, Math.abs(a[g] - b[g]) / (RANGE[g][1] - RANGE[g][0]));
    else sum += a[g] === b[g] ? 0 : 1;
  }
  return sum / GENES.length;
}

export interface Hybrid {
  sp: Species;
  /** the genes that came from the donor */
  genes: Gene[];
}

/**
 * The eater `a` takes up 1–3 of the donor's genes that differ from its own: genes with a range move a third
 * to half of the way, the rest are taken over. Each one may mutate at the eater's mutation rate. The main colour
 * always moves toward the donor's, so the hybrid can be told apart. Null when the two share every gene.
 * `taken` says whether a species name is in use.
 */
export function hybridise(a: Species, b: Species, rnd: () => number, taken: (name: string) => boolean): Hybrid | null {
  const open = GENES.filter((g) => differs(a, b, g));
  if (!open.length) return null;
  const genes: Gene[] = [];
  for (let n = 1 + Math.floor(rnd() * 3); n > 0 && open.length; n--) genes.push(open.splice(Math.floor(rnd() * open.length), 1)[0]!);
  const m = a.mutation;
  const h: Species = { ...a, parents: [a, b], seed: (rnd() * 2 ** 31) | 0 };
  for (const g of genes) {
    const k = 1 / 3 + rnd() / 6;
    if (g === 'hue2') h.hue2 = (towardAngle(a.hue2, b.hue2, k) + (rnd() - 0.5) * m * 60 + 360) % 360;
    else if (isRange(g)) {
      let v = (a[g] + (b[g] - a[g]) * k) * (1 + (rnd() - 0.5) * m);
      v = clamp(v, RANGE[g]);
      h[g] = WHOLE[g] ? Math.round(v) : v;
      // a bigger body needs more energy to divide, as in genome(): keep the two in step
      if (g === 'size') h.divideAt = a.divideAt * Math.pow(h.size / a.size, 1.1);
    } else if (g === 'body') h.body = rnd() < m * 0.5 ? BODIES[Math.floor(rnd() * BODIES.length)]! : b.body;
    else if (g === 'diet') h.diet = rnd() < m * 0.5 ? DIETS[Math.floor(rnd() * DIETS.length)]! : b.diet;
    else h[g] = rnd() < m * 0.5 ? !b[g] : b[g];
  }
  h.hue = towardAngle(a.hue, b.hue, 0.3 + rnd() * 0.2);
  h.name = hybridName(a, b, rnd, taken);
  return { sp: h, genes };
}

/** "Genus × epithet": the eater's genus, an epithet spliced from both parents' (botanists write hybrids like this) */
function hybridName(a: Species, b: Species, rnd: () => number, taken: (name: string) => boolean): string {
  const genus = a.name.split(' ')[0]!;
  const epA = a.name.split(' ').pop()!,
    epB = b.name.split(' ').pop()!;
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
