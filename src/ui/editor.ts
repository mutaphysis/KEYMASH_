// Edit mode: the textarea, the mode's backdrop behind it (two canvases), and a key bar for
// phones: cursor keys plus the mode's symbols and emoji.
import { $, ctx2d } from './dom';
import { graphemes } from '../lang/lexer';
import type { Backdrop } from '../modes/types';

type InputLike = { data?: string | null; inputType?: string };
export interface EditorOpts {
  onChange?: (v: string) => void;
  onType?: (ch: string, inputType: string) => void;
}
type KeyDef = string | [label: string, action: string];
const NAV_KEYS: KeyDef[] = [
  ['◀', 'left'],
  ['▶', 'right'],
  ['▲', 'up'],
  ['▼', 'down'],
  ['⏎', '\n'],
];

export class Editor {
  ta = $<HTMLTextAreaElement>('code');
  wrap = $('editorWrap');
  back = $<HTMLCanvasElement>('rain');
  front = $<HTMLCanvasElement>('sparks');
  bc = ctx2d(this.back);
  fc = ctx2d(this.front);
  onChange: (v: string) => void;
  onType: (ch: string, inputType: string) => void;
  backdrop: Backdrop | null = null;
  active = true;
  last = 0;
  dpr = 1;
  w = 0;
  h = 0;
  mirror: HTMLDivElement | null = null;

  constructor(opts: EditorOpts) {
    this.onChange = opts.onChange || (() => {});
    this.onType = opts.onType || (() => {});
    this.mouseScroll($('keybar'));
    this.ta.addEventListener('input', (e) => this.input(e as InputEvent));
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      if (this.active) this.draw(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  get value(): string {
    return this.ta.value;
  }
  set value(v: string) {
    this.ta.value = v;
    this.onChange(v);
  }

  /** a mode brings its own backdrop and key bar */
  configure(backdrop: Backdrop, keys: string[]): void {
    this.backdrop = backdrop;
    backdrop.resize(this.w, this.h);
    for (const c of [this.bc, this.fc]) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, c.canvas.width, c.canvas.height);
    }
    this.buildKeybar(keys);
  }

  resize(): void {
    const r = this.wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [this.back, this.front]) {
      c.width = Math.max(1, r.width * dpr);
      c.height = Math.max(1, r.height * dpr);
    }
    this.dpr = dpr;
    this.w = r.width;
    this.h = r.height;
    this.backdrop?.resize(r.width, r.height);
  }

  input(e?: InputLike): void {
    const v = this.ta.value;
    this.onChange(v);
    const pos = this.ta.selectionStart;
    const ch = e && e.data ? (graphemes(e.data).pop() ?? '') : v.slice(Math.max(0, pos - 1), pos);
    const [x, y] = this.caretXY();
    this.backdrop?.typed(ch, x, y);
    this.onType(ch, (e && e.inputType) || 'insertText');
    this.wrap.classList.remove('pulse');
    void this.wrap.offsetWidth;
    this.wrap.classList.add('pulse');
  }

  // caret pixel position via a mirror div
  caretXY(): [number, number] {
    const ta = this.ta;
    if (!this.mirror) {
      this.mirror = document.createElement('div');
      Object.assign(this.mirror.style, { position: 'absolute', visibility: 'hidden', top: '0', left: '-9999px', overflow: 'hidden' });
      document.body.appendChild(this.mirror);
    }
    const m = this.mirror;
    const cs = getComputedStyle(ta);
    const props = [
      'fontFamily',
      'fontSize',
      'lineHeight',
      'letterSpacing',
      'paddingTop',
      'paddingLeft',
      'paddingRight',
      'paddingBottom',
      'whiteSpace',
      'wordBreak',
      'overflowWrap',
      'boxSizing',
      'borderWidth',
    ] as const;
    for (const p of props) m.style[p] = cs[p];
    m.style.width = ta.clientWidth + 'px';
    const pos = ta.selectionStart || 0;
    m.textContent = ta.value.slice(0, pos);
    const span = document.createElement('span');
    span.textContent = ta.value.slice(pos, pos + 1) || '.';
    m.appendChild(span);
    const x = span.offsetLeft;
    const y = span.offsetTop - ta.scrollTop + (parseFloat(cs.lineHeight) || 28) * 0.55;
    return [Math.min(this.w - 4, Math.max(4, x)), Math.min(this.h - 4, Math.max(4, y))];
  }

  draw(dt: number): void {
    if (!this.backdrop) return;
    const d = this.dpr;
    this.bc.setTransform(d, 0, 0, d, 0, 0);
    this.fc.setTransform(d, 0, 0, d, 0, 0);
    this.backdrop.draw(this.bc, this.fc, dt);
  }

  /** with a mouse the key bar can't be swiped: scroll it with the wheel or by dragging */
  mouseScroll(bar: HTMLElement): void {
    bar.addEventListener(
      'wheel',
      (e) => {
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
        bar.scrollLeft += e.deltaY;
        e.preventDefault();
      },
      { passive: false },
    );
    let drag: { x: number; left: number; moved: boolean } | null = null;
    let dragged = false;
    bar.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button === 0) drag = { x: e.clientX, left: bar.scrollLeft, moved: false };
    });
    window.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 5) {
        drag.moved = true;
        bar.classList.add('dragging');
      }
      if (drag.moved) bar.scrollLeft = drag.left - dx;
    });
    window.addEventListener('pointerup', () => {
      if (drag?.moved) dragged = true;
      drag = null;
      bar.classList.remove('dragging');
    });
    // a drag is not a key press
    bar.addEventListener(
      'click',
      (e) => {
        if (dragged) {
          e.stopPropagation();
          e.preventDefault();
          dragged = false;
        }
      },
      true,
    );
  }

  // ---------- key bar ----------
  buildKeybar(keys: string[]): void {
    const bar = $('keybar');
    bar.textContent = '';
    for (const k of [...NAV_KEYS, ...keys]) {
      const b = document.createElement('button');
      const [label, val] = Array.isArray(k) ? k : [k, k];
      b.textContent = label;
      b.type = 'button';
      if (Array.isArray(k)) b.className = 'nav';
      // keep focus in the textarea so the phone keyboard stays open
      b.addEventListener('pointerdown', (e) => e.preventDefault());
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => this.key(val));
      bar.appendChild(b);
    }
  }

  key(val: string): void {
    const ta = this.ta;
    if (val === 'left' || val === 'right') {
      const p = ta.selectionStart + (val === 'left' ? -1 : 1);
      const q = Math.max(0, Math.min(ta.value.length, p));
      ta.setSelectionRange(q, q);
    } else if (val === 'up' || val === 'down') {
      const v = ta.value;
      const p = ta.selectionStart;
      const ls = v.lastIndexOf('\n', p - 1) + 1;
      const col = p - ls;
      let q: number;
      if (val === 'up') {
        if (ls === 0) q = 0;
        else {
          const ps = v.lastIndexOf('\n', ls - 2) + 1;
          q = Math.min(ps + col, ls - 1);
        }
      } else {
        const le = v.indexOf('\n', p);
        if (le < 0) q = v.length;
        else {
          const ne = v.indexOf('\n', le + 1);
          q = Math.min(le + 1 + col, ne < 0 ? v.length : ne);
        }
      }
      ta.setSelectionRange(q, q);
    } else {
      this.insert(val);
      return;
    }
    ta.focus({ preventScroll: true });
    const [x, y] = this.caretXY();
    this.backdrop?.typed('', x, y);
  }

  insert(text: string): void {
    const ta = this.ta;
    const s = ta.selectionStart,
      e = ta.selectionEnd;
    ta.setRangeText(text, s, e, 'end');
    ta.focus({ preventScroll: true });
    this.input({ data: text });
  }
}
