// The genome viewer's double helix: one base pair per base of the sequence, lying on its side and turning.
// Behind the pairs, one band per gene in its group's colour. Pure drawing on a 2D context.
import { GENES } from '../genome';
import type { GeneGroup } from '../genome';

const BASE_COLOR: Record<string, string> = { A: '#5fd6a0', C: '#68b8ff', G: '#ffd166', T: '#ff7aa8' };
const PAIR: Record<string, string> = { A: 'T', T: 'A', C: 'G', G: 'C' };
export const GROUP_HUE: Record<GeneGroup, number> = { form: 174, motion: 204, food: 96, defence: 340, social: 276, colour: 44 };
/** the gene each base of the sequence belongs to */
export const GENE_OF_BASE: readonly number[] = GENES.flatMap((d, i) => Array<number>(d.bases).fill(i));
/** the first base of each gene */
const FIRST_BASE: readonly number[] = GENES.map((_, i) => GENE_OF_BASE.indexOf(i));

export interface HelixLook {
  /** the gene under the pointer, -1 for none */
  hover: number;
  /** a gene just changed: it flashes for `flashT` seconds (counting down) */
  flash: number;
  flashT: number;
}

/** where pair i sits across a canvas `w` wide, for a sequence of n bases */
const step = (w: number, n: number) => w / (n + 1);

/** the base pair under x, clamped to the sequence */
export function pairAt(x: number, w: number, n: number): number {
  return Math.max(0, Math.min(n - 1, Math.round(x / step(w, n)) - 1));
}

export function drawHelix(c: CanvasRenderingContext2D, w: number, h: number, seq: string, rot: number, look: HelixLook, dpr: number): void {
  const n = seq.length,
    dx = step(w, n),
    cy = h * 0.44,
    amp = h * 0.32;
  c.clearRect(0, 0, w, h);
  // the genes, as bands behind their pairs
  GENES.forEach((d, g) => {
    const x0 = dx * (FIRST_BASE[g]! + 1) - dx / 2,
      bw = dx * d.bases;
    const hot = g === look.hover,
      flash = g === look.flash ? Math.max(0, look.flashT) : 0;
    c.fillStyle = `hsla(${GROUP_HUE[d.group]},70%,60%,${(hot ? 0.22 : 0.08) + flash * 0.5})`;
    c.fillRect(x0 + dpr, 0, bw - 2 * dpr, h);
    if (hot) {
      c.strokeStyle = `hsla(${GROUP_HUE[d.group]},80%,70%,.7)`;
      c.lineWidth = dpr;
      c.strokeRect(x0 + 1.5 * dpr, 0.5 * dpr, bw - 3 * dpr, h - dpr);
    }
  });
  const at = (i: number, strand: 1 | -1) => {
    const phi = 0.55 * i + rot;
    return { x: dx * (i + 1), y: cy + strand * Math.sin(phi) * amp, z: strand * Math.cos(phi) };
  };
  // the two strands, in short pieces: those behind first (dim), then the rungs, then those in front
  const strands = (front: boolean) => {
    for (const s of [1, -1] as const)
      for (let k = 0; k < (n - 1) * 4; k++) {
        const a = at(k / 4, s),
          b = at((k + 1) / 4, s),
          z = (a.z + b.z) / 2;
        if (z >= 0 !== front) continue;
        c.strokeStyle = `rgba(190,255,235,${0.25 + 0.5 * (z + 1) * 0.5})`;
        c.lineWidth = (1.2 + (z + 1) * 0.9) * dpr;
        c.beginPath();
        c.moveTo(a.x, a.y);
        c.lineTo(b.x, b.y);
        c.stroke();
      }
  };
  c.lineCap = 'round';
  strands(false);
  for (let i = 0; i < n; i++) {
    const a = at(i, 1),
      b = at(i, -1),
      mx = (a.x + b.x) / 2,
      my = (a.y + b.y) / 2;
    const base = seq[i]!;
    for (const [p, col] of [
      [a, BASE_COLOR[base]!],
      [b, BASE_COLOR[PAIR[base]!]!],
    ] as const) {
      c.globalAlpha = 0.35 + 0.6 * (p.z + 1) * 0.5;
      c.strokeStyle = col;
      c.lineWidth = (1.5 + (p.z + 1)) * dpr;
      c.beginPath();
      c.moveTo(p.x, p.y);
      c.lineTo(mx, my);
      c.stroke();
    }
  }
  c.globalAlpha = 1;
  strands(true);
  // the letters, small, under the pairs
  c.font = `${9 * dpr}px "Share Tech Mono", ui-monospace, monospace`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = 'rgba(190,255,235,.5)';
  for (let i = 0; i < n; i++) c.fillText(seq[i]!, dx * (i + 1), h * 0.9);
}
