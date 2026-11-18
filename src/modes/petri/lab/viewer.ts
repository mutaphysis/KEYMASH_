// The genome viewer: a specimen's genes as a turning double helix. Point at a band to read its gene,
// tap it to step the gene on; the preview, abilities and name follow. Keep puts the new genes
// where the specimen came from (the cell in the dish, the drawer, the bench); debris is read only.
import { BODIES, DIETS, GENES, HUE_STEP, encodeGenome, nameOf, specimen } from '../genome';
import type { GeneId, Genome, Species } from '../genome';
import type { Cell, World } from '../sim';
import type { MicroRenderer } from '../render';
import { t } from '../messages';
import type { PetriMsg } from '../messages';
import type { Entry } from './specimens';
import { GENE_OF_BASE, GROUP_HUE, drawHelix, pairAt } from './helix';
import type { HelixLook } from './helix';
import * as css from './viewer.css';
import { $, ctx2d } from '../../../ui/dom';
import type { KmToast } from '../../../ui/components/toast';
import { t as tShared } from '../../../i18n';
import { iconEl } from '../../../ui/icon';
import type { IconName } from '../../../ui/icon';

export type ViewTarget =
  | { kind: 'cell'; cell: Cell }
  | { kind: 'debris'; sp: Species }
  | { kind: 'entry'; entry: Entry }
  | { kind: 'bench' };

export interface ViewerHost {
  r: MicroRenderer;
  world(): World | null;
  /** the edited genes go back where the specimen came from */
  keep(target: ViewTarget, g: Genome): void;
}

const GENE_LABEL: Record<GeneId, PetriMsg> = {
  body: 'geneBody',
  size: 'geneSize',
  lobes: 'geneLobes',
  wobble: 'geneWobble',
  organelles: 'geneOrganelles',
  flagella: 'geneFlagella',
  speed: 'geneSpeed',
  diet: 'geneDiet',
  fertility: 'geneFertility',
  life: 'geneLife',
  mutation: 'geneMutation',
  toxic: 'geneToxic',
  armor: 'geneArmor',
  colony: 'geneColony',
  symbiosis: 'geneSymbiosis',
  spores: 'geneSpores',
  hue: 'geneHue',
  hue2: 'geneHue2',
  sat: 'geneSat',
  glow: 'geneGlow',
};
const DIET_ICON: Record<Species['diet'], IconName> = { grazer: 'food', hunter: 'hunter', photo: 'photo', omni: 'omni' };
/** seconds a gene's change plays on the helix */
const CHANGE_TIME = 0.9;
const HELIX_H = 120;
const PREVIEW = 150;

const dpr = () => Math.min(window.devicePixelRatio || 1, 2);

export class Viewer {
  readonly el = document.createElement('div');
  private host: ViewerHost;
  private panel = document.createElement('div');
  private nameEl = document.createElement('div');
  private helixCv = document.createElement('canvas');
  private helixCtx = ctx2d(this.helixCv);
  private captionEl = document.createElement('div');
  /** the preview, its abilities in its top left corner */
  private stage = document.createElement('div');
  private previewCv = document.createElement('canvas');
  private previewCtx = ctx2d(this.previewCv);
  private abilitiesEl = document.createElement('div');
  private statsEl = document.createElement('div');
  /** discard / keep: only once a gene has changed */
  private buttonsEl = document.createElement('div');
  private target: ViewTarget | null = null;
  /** the specimen as it came, its genes, and the genes as edited (and what they grow into) */
  private sp!: Species;
  private seq0 = '';
  private g: Genome = [];
  private shown!: Species;
  private stats: { fill: HTMLElement; value: () => number }[] = [];
  private statT = 0;
  private rot = 0.4;
  /** seconds the helix stays still after a touch */
  private still = 0;
  private pointerOver = false;
  private look: HelixLook = { hover: -1, flash: -1, flashT: 0, from: '', gentle: false };
  private time = 0;
  /** a gene just changed: the preview turns from `before` into the new specimen while `t` counts 1 → 0 */
  private morph: { before: Species; hue: number; t: number } | null = null;

  constructor(host: ViewerHost) {
    this.host = host;
    this.el.className = css.overlay;
    this.el.hidden = true;
    this.panel.className = css.panel;
    this.nameEl.className = css.name;
    // the name copies the genome (as edited) to the clipboard, to share or keep elsewhere
    this.nameEl.setAttribute('role', 'button');
    this.nameEl.tabIndex = 0;
    this.nameEl.title = t('labCopyGenome');
    this.nameEl.addEventListener('click', () => void this.copy());
    this.nameEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') void this.copy();
    });
    this.helixCv.className = css.helix;
    this.captionEl.className = css.caption;
    this.stage.className = css.stage;
    this.previewCv.className = css.preview;
    this.abilitiesEl.className = css.abilities;
    this.stage.append(this.previewCv, this.abilitiesEl);
    this.statsEl.className = css.stats;
    this.buttonsEl.className = css.buttons;
    this.panel.append(this.nameEl, this.helixCv, this.captionEl, this.stage, this.statsEl, this.buttonsEl);
    this.el.append(this.panel);
    // a tap outside the panel or Esc: discard
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target === this.el) this.close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.el.hidden) this.close();
    });
    this.helixCv.addEventListener('pointermove', (e) => {
      this.pointerOver = true;
      this.point(this.geneAt(e));
    });
    this.helixCv.addEventListener('pointerleave', () => {
      this.pointerOver = false;
      this.look.hover = -1;
    });
    this.helixCv.addEventListener('pointerdown', () => (this.still = 3));
    // a click, not a pointerdown: a swipe over the helix (scrolling the panel) changes nothing
    this.helixCv.addEventListener('click', (e) => this.step(this.geneAt(e)));
  }

  /** the buttons, once the viewer is in the document (km-buttons build themselves when connected) */
  mount(): void {
    const button = (icon: IconName, text: string, onClick: () => void, primary = false) => {
      const b = document.createElement('km-button');
      b.setAttribute('variant', 'play');
      b.setAttribute('icon', icon);
      if (primary) b.setAttribute('primary', '');
      this.buttonsEl.append(b);
      b.text = text;
      b.addEventListener('click', onClick);
      return b;
    };
    button('close', t('labDiscard'), () => this.close());
    button('check', t('labKeep'), () => this.keep(), true);
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  show(target: ViewTarget, sp: Species): void {
    this.target = target;
    this.sp = sp;
    this.seq0 = encodeGenome(sp.genome);
    this.g = sp.genome.slice();
    this.look = { hover: -1, flash: -1, flashT: 0, from: '', gentle: false };
    this.morph = null;
    this.captionEl.replaceChildren();
    this.buildStats();
    this.changed();
    this.el.hidden = false;
    this.statT = 0;
  }

  /** the genome as shown (edits included) as its ACGT sequence */
  private async copy(): Promise<void> {
    const toast = $<KmToast>('toast');
    try {
      await navigator.clipboard.writeText(encodeGenome(this.g));
      toast.show(t('labCopied'), 'copy');
    } catch (e) {
      toast.show(tShared('copyBlocked'));
    }
  }

  close(): void {
    this.el.hidden = true;
    this.target = null;
  }

  private keep(): void {
    const target = this.target;
    if (target && this.edited()) this.host.keep(target, this.g);
    this.close();
  }

  private edited(): boolean {
    return encodeGenome(this.g) !== this.seq0;
  }

  /** the gene under a pointer on the helix */
  private geneAt(e: MouseEvent): number {
    const b = this.helixCv.getBoundingClientRect();
    return GENE_OF_BASE[pairAt(((e.clientX - b.left) / b.width) * this.helixCv.width, this.helixCv.width, GENE_OF_BASE.length)]!;
  }

  /** one line about the gene pointed at: its name and its value */
  private point(gene: number): void {
    this.look.hover = gene;
    const d = GENES[gene]!,
      s = this.g[gene]!;
    const label = document.createElement('b');
    label.textContent = t(GENE_LABEL[d.id]);
    const value = document.createElement('span');
    if (d.id === 'body') value.textContent = t(BODIES[s]!);
    else if (d.id === 'diet') value.textContent = t(DIETS[s]!);
    else if (d.kind === 'switch') value.textContent = t(s ? 'geneOn' : 'geneOff');
    else if (d.kind === 'circle') {
      value.className = css.dot;
      value.style.background = `hsl(${s * HUE_STEP} 70% 62%)`;
    } else value.textContent = `${s + 1}/${d.states}`;
    this.captionEl.replaceChildren(label, value);
  }

  /** a tap: the gene steps on to its next state; the helix and the preview play the change */
  private step(gene: number): void {
    const before = this.shown;
    this.look.from = encodeGenome(this.g);
    this.g[gene] = (this.g[gene]! + 1) % GENES[gene]!.states;
    this.look.flash = gene;
    this.look.flashT = 1;
    if (!this.host.r.gentle) this.morph = { before, hue: GROUP_HUE[GENES[gene]!.group], t: 1 };
    this.point(gene);
    this.changed();
  }

  /** the genes changed (or the viewer opened): name, preview, abilities, the keep button */
  private changed(): void {
    const edited = this.edited();
    this.shown = edited ? specimen(this.g) : this.sp;
    this.nameEl.textContent = edited ? nameOf(this.g) : this.sp.name;
    this.nameEl.style.color = `hsl(${this.shown.hue | 0} 70% 75%)`;
    // nothing to keep or throw away until a gene changed; debris is only looked at
    this.buttonsEl.hidden = !edited || this.target?.kind === 'debris';
    const sp = this.shown;
    const items: [IconName, string][] = [[DIET_ICON[sp.diet], t(sp.diet)]];
    if (sp.toxic >= 0.25) items.push(['toxin', t('toxic')]);
    if (sp.armor >= 0.3) items.push(['armor', t('armored')]);
    if (sp.glow >= 0.55) items.push(['glow', t('glowing')]);
    if (sp.symbiosis) items.push(['bond', t('symbiotic')]);
    if (sp.spores) items.push(['spores', t('spores')]);
    if (sp.colony >= 0.75) items.push(['colony', t('colonial')]);
    this.abilitiesEl.replaceChildren(
      ...items.map(([icon, text]) => {
        const a = document.createElement('div');
        a.className = css.ability;
        const s = document.createElement('span');
        s.textContent = text;
        a.append(iconEl(icon), s);
        return a;
      }),
    );
    this.statT = 0;
  }

  /** a living cell shows how it is doing; anything else what its genes promise */
  private buildStats(): void {
    const target = this.target!;
    const rows: [IconName, PetriMsg, () => number][] =
      target.kind === 'cell'
        ? [
            ['age', 'statAge', () => target.cell.age / target.cell.life],
            [
              'hunger',
              'statHunger',
              () => 1 - target.cell.energy / (this.host.world()?.divideNeed(target.cell.sp) ?? target.cell.sp.divideAt),
            ],
            ['speed', 'statSpeed', () => target.cell.speed / 80],
          ]
        : [
            ['speed', 'statSpeed', () => this.shown.speed / 80],
            ['life', 'statLife', () => this.shown.life / 140],
          ];
    this.statsEl.replaceChildren();
    this.stats = rows.map(([icon, label, value]) => {
      const i = iconEl(icon);
      i.classList.add(css.statIcon);
      i.title = t(label);
      const bar = document.createElement('div');
      bar.className = css.bar;
      bar.title = t(label);
      const fill = document.createElement('div');
      fill.className = css.fill;
      bar.append(fill);
      this.statsEl.append(i, bar);
      return { fill, value };
    });
  }

  frame(dt: number): void {
    if (this.el.hidden) return;
    this.time += dt;
    const d = dpr(),
      gentle = this.host.r.gentle;
    if (gentle) this.rot = 0.4;
    else if (!this.pointerOver && this.still <= 0) this.rot += 0.6 * dt;
    this.still -= dt;
    this.look.flashT = Math.max(0, this.look.flashT - dt / CHANGE_TIME);
    this.look.gentle = gentle;
    const w = Math.max(2, Math.round(this.helixCv.clientWidth * d)),
      h = Math.round(HELIX_H * d);
    if (this.helixCv.width !== w || this.helixCv.height !== h) {
      this.helixCv.width = w;
      this.helixCv.height = h;
    }
    drawHelix(this.helixCtx, w, h, encodeGenome(this.g), this.rot, this.look, d);
    const n = Math.round(PREVIEW * d);
    if (this.previewCv.width !== n || this.previewCv.height !== n) this.previewCv.width = this.previewCv.height = n;
    this.previewCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.previewCtx.clearRect(0, 0, n, n);
    if (this.morph && (this.morph.t -= dt / CHANGE_TIME) > 0) this.drawMorph(n, d);
    else {
      this.morph = null;
      this.host.r.portrait(this.previewCtx, this.shown, n / 2, n / 2, n * 0.26, n * 0.42, this.time, d);
    }
    if ((this.statT -= dt) <= 0) {
      this.statT = 0.3;
      for (const s of this.stats) s.fill.style.width = `${Math.round(Math.max(0, Math.min(1, s.value())) * 100)}%`;
    }
  }

  /** the preview changing: a ring of DNA in the gene's colour wiggles around it, the old specimen shrinks away inside,
   * the new one wobbles into its place */
  private drawMorph(n: number, d: number): void {
    const g = this.previewCtx,
      { before, hue, t } = this.morph!,
      p = 1 - t,
      T = this.time,
      cx = n / 2,
      cy = n / 2,
      r = this.host.r;
    const ease = (a: number, b: number) => {
      const u = Math.max(0, Math.min(1, (p - a) / (b - a)));
      return u * u * (3 - 2 * u);
    };
    // the ring: two strands around the specimen, wiggling across each other, rungs between, turning as it tightens
    const env = Math.sin(Math.PI * p),
      R = n * 0.37 * (1.05 - 0.1 * p),
      spin = T * 1.5 + p * 4,
      at = (a: number, s: 1 | -1): [number, number] => {
        const rr = R + s * Math.sin(a * 7 + T * 9) * n * 0.03 * (0.4 + env);
        return [cx + Math.cos(a + spin) * rr, cy + Math.sin(a + spin) * rr];
      };
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    g.lineWidth = 1.6 * d;
    for (const s of [1, -1] as const) {
      g.strokeStyle = `hsla(${hue},80%,72%,${0.75 * env})`;
      g.beginPath();
      for (let i = 0; i <= 96; i++) {
        const [x, y] = at((i / 96) * Math.PI * 2, s);
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
    }
    g.lineWidth = 1.2 * d;
    g.strokeStyle = `hsla(${hue},70%,78%,${0.4 * env})`;
    g.beginPath();
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2,
        [x0, y0] = at(a, 1),
        [x1, y1] = at(a, -1);
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
    }
    g.stroke();
    // a soft flash in the middle as the old turns into the new
    const flash = Math.sin(Math.PI * Math.max(0, Math.min(1, (p - 0.25) / 0.35)));
    if (flash > 0) {
      const f = g.createRadialGradient(cx, cy, 0, cx, cy, n * 0.32);
      f.addColorStop(0, `hsla(${hue},80%,85%,${0.35 * flash})`);
      f.addColorStop(1, `hsla(${hue},80%,85%,0)`);
      g.fillStyle = f;
      g.fillRect(0, 0, n, n);
    }
    g.globalCompositeOperation = 'source-over';
    // the old specimen shrinks and fades; the new one grows in with a jelly wobble that settles
    const out = ease(0, 0.45);
    if (out < 1) {
      const k = 1 - 0.35 * out;
      g.globalAlpha = 1 - out;
      r.portrait(g, before, cx, cy, n * 0.26 * k, n * 0.42 * k, T, d);
    }
    const grow = ease(0.25, 0.65);
    if (grow > 0) {
      const k = (0.65 + 0.35 * grow) * (1 + 0.1 * Math.sin(p * Math.PI * 5) * (1 - p));
      g.globalAlpha = grow;
      r.portrait(g, this.shown, cx, cy, n * 0.26 * k, n * 0.42 * k, T, d);
    }
    g.globalAlpha = 1;
  }
}
