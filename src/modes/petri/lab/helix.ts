// The genome viewer's double helix, drawn flat: one base pair per base of the sequence, lying on its side, its waves
// sliding along as it turns. Behind the pairs, one band per gene in its group's colour. Pure drawing on a 2D context.
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
  // flat, no depth: two even strands crossing, rungs between them; turning only slides the waves along
  const strandY = (x: number, strand: 1 | -1) => cy + strand * Math.sin(0.55 * (x / dx - 1) + rot) * amp;
  c.lineCap = 'butt';
  c.lineWidth = 2.5 * dpr;
  for (let i = 0; i < n; i++) {
    const x = dx * (i + 1),
      base = seq[i]!;
    // each half of the rung in its base's colour, meeting its partner on the middle line
    for (const [s, col] of [
      [1, BASE_COLOR[base]!],
      [-1, BASE_COLOR[PAIR[base]!]!],
    ] as const) {
      c.strokeStyle = col;
      c.beginPath();
      c.moveTo(x, strandY(x, s));
      c.lineTo(x, cy);
      c.stroke();
    }
  }
  // each strand one path, over the rungs' ends and half a pair past the first and last
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.lineWidth = 2 * dpr;
  c.strokeStyle = 'rgba(190,255,235,.8)';
  for (const s of [1, -1] as const) {
    c.beginPath();
    for (let k = 0; k <= n * 8; k++) {
      const x = dx * (0.5 + k / 8);
      k ? c.lineTo(x, strandY(x, s)) : c.moveTo(x, strandY(x, s));
    }
    c.stroke();
  }
  // the letters, small, under the pairs
  c.font = `${9 * dpr}px "Share Tech Mono", ui-monospace, monospace`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = 'rgba(190,255,235,.5)';
  for (let i = 0; i < n; i++) c.fillText(seq[i]!, dx * (i + 1), h * 0.9);
}
