// The genome viewer's double helix, drawn flat: one base pair per base of the sequence, lying on its side, its waves
// sliding along as it turns. Behind the pairs, one band per gene in its group's colour. A gene that changes plays out
// on it: the strands wiggle apart there, its changed pairs unzip, sparkle and zip up again in their new bases, while
// their letters flicker through ACGT. Pure drawing on a 2D context.
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
  /** a gene just changed: it plays its change for `flashT` (1 → 0, counting down) */
  flash: number;
  flashT: number;
  /** the sequence before that change: its pairs show what each changed base was */
  from: string;
  /** prefers-reduced-motion: only the band lights up */
  gentle: boolean;
}

const BASES = 'ACGT';
const smooth = (x: number) => {
  const u = Math.max(0, Math.min(1, x));
  return u * u * (3 - 2 * u);
};

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
  // the change being played: p runs 0 → 1; the gene's middle (in pairs) and which of its bases changed
  const playing = look.flash >= 0 && look.flashT > 0 && !look.gentle,
    p = playing ? 1 - look.flashT : 1,
    gd = playing ? GENES[look.flash]! : null,
    first = gd ? FIRST_BASE[look.flash]! : 0,
    mid = gd ? first + (gd.bases - 1) / 2 : 0;
  const changed = (i: number) => playing && i >= first && i < first + gd!.bases && look.from[i] !== undefined && look.from[i] !== seq[i];
  // the wiggle: a bump of the strands around the gene that swells and dies away, a wave running through it
  const env = playing ? Math.sin(Math.PI * Math.min(1, p * 1.4)) : 0;
  const bump = (x: number) => (env ? env * Math.exp(-(((x / dx - 1 - mid) / 2.2) ** 2)) : 0);
  // flat, no depth: two even strands crossing, rungs between them; turning only slides the waves along. The wiggle is
  // a gentle one and stays inside the canvas
  const strandY = (x: number, strand: 1 | -1) => {
    const b = bump(x);
    return cy + strand * Math.sin(0.55 * (x / dx - 1) + rot) * amp * (1 + 0.15 * b) + b * Math.sin((x / dx) * 2.4 - p * 24) * amp * 0.12;
  };
  // a changed pair unzips (its halves draw back into the strands), turns into the new bases and zips up again
  const UNZIP = 0.4;
  c.lineCap = 'butt';
  c.lineWidth = 2.5 * dpr;
  for (let i = 0; i < n; i++) {
    const x = dx * (i + 1),
      ch = changed(i),
      base = ch && p < UNZIP ? look.from[i]! : seq[i]!,
      reach = ch ? (p < UNZIP ? 1 - smooth(p / UNZIP) : smooth((p - UNZIP) / (1 - UNZIP))) : 1,
      ya = strandY(x, 1),
      yb = strandY(x, -1),
      ym = (ya + yb) / 2;
    // each half of the rung in its base's colour, meeting its partner on the middle line
    for (const [y, col] of [
      [ya, BASE_COLOR[base]!],
      [yb, BASE_COLOR[PAIR[base]!]!],
    ] as const) {
      if (reach <= 0.02) continue;
      c.strokeStyle = col;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x, y + (ym - y) * reach);
      c.stroke();
    }
    // as it turns into the new base, a few sparks drift off in the new colour
    const sp = (p - UNZIP + 0.08) / 0.5;
    if (ch && sp > 0 && sp < 1) {
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = BASE_COLOR[seq[i]!]!;
      c.globalAlpha = 0.6 * (1 - sp);
      for (let j = 0; j < 4; j++) {
        const a = j * 1.6 + i * 2.3,
          r = smooth(sp) * h * 0.18;
        c.beginPath();
        c.arc(x + Math.cos(a) * r, ym + Math.sin(a) * r * 0.8, (1.3 - sp * 0.6) * dpr, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
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
  // the letters, small, under the pairs; a changed one flickers through ACGT, then pops up in its new base's colour
  c.font = `${9 * dpr}px "Share Tech Mono", ui-monospace, monospace`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  for (let i = 0; i < n; i++) {
    const x = dx * (i + 1),
      y = h * 0.9;
    if (!changed(i)) {
      c.fillStyle = 'rgba(190,255,235,.5)';
      c.fillText(seq[i]!, x, y);
      continue;
    }
    const settled = p >= UNZIP;
    const letter = settled ? seq[i]! : BASES[(Math.floor(p * 40) + i) % 4]!,
      pop = settled ? 1 + 0.3 * Math.sin(Math.PI * Math.min(1, (p - UNZIP) / 0.35)) : 1;
    c.save();
    c.translate(x, y);
    c.scale(pop, pop);
    c.fillStyle = settled ? BASE_COLOR[letter]! : 'rgba(235,255,245,.9)';
    c.fillText(letter, 0, 0);
    c.restore();
  }
}
