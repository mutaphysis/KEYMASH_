// Edit mode: matrix rain behind the textarea, sparks at the caret, a key bar for
// phones (symbols, emoji, cursor movement), and a little note for every keystroke.
import { keyInfo } from '../lang/keys.js';
import { graphemes } from '../lang/lexer.js';

const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ0123456789#$%&@!?*<>{}[]~^';

export class Editor {
  constructor(opts) {
    this.ta = document.getElementById('code');
    this.wrap = document.getElementById('editorWrap');
    this.rain = document.getElementById('rain');
    this.sparks = document.getElementById('sparks');
    this.rc = this.rain.getContext('2d');
    this.sc = this.sparks.getContext('2d');
    this.onChange = opts.onChange || (() => {});
    this.onKey = opts.onKey || (() => {});
    this.onType = opts.onType || (() => {});
    this.cols = []; this.parts = []; this.typed = [];
    this.active = true;
    this.buildKeybar();
    this.ta.addEventListener('input', (e) => this.input(e));
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.last = performance.now();
    const loop = (t) => { const dt = Math.min(0.05, (t - this.last) / 1000); this.last = t; if (this.active) this.draw(dt); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  get value() { return this.ta.value; }
  set value(v) { this.ta.value = v; this.onChange(v); }

  resize() {
    const r = this.wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [this.rain, this.sparks]) { c.width = Math.max(1, r.width * dpr); c.height = Math.max(1, r.height * dpr); }
    this.dpr = dpr; this.w = r.width; this.h = r.height;
    const fs = 16; const n = Math.ceil(r.width / fs);
    while (this.cols.length < n) this.cols.push({ y: Math.random() * r.height, v: 40 + Math.random() * 90, ch: [] });
    this.cols.length = n;
  }

  input(e) {
    const v = this.ta.value;
    this.onChange(v);
    const pos = this.ta.selectionStart;
    const ch = e && e.data ? graphemes(e.data).pop() : v.slice(Math.max(0, pos - 1), pos);
    const [x, y] = this.caretXY();
    this.burst(x, y, ch);
    this.onType(ch || '', (e && e.inputType) || 'insertText');
    if (ch && ch.trim()) {
      this.typed.push(ch); if (this.typed.length > 60) this.typed.shift();
      // drop the typed char into a rain column
      const col = this.cols[Math.floor(Math.random() * this.cols.length)];
      if (col) col.inject = ch;
      this.onKey(ch, keyInfo(ch));
    }
    this.wrap.classList.remove('pulse'); void this.wrap.offsetWidth; this.wrap.classList.add('pulse');
  }

  burst(x, y, ch) {
    const k = keyInfo(ch || 'a');
    const hue = 100 + k.col * 18;
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 160;
      this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: 0.4 + Math.random() * 0.5, age: 0, hue });
    }
    if (this.parts.length > 400) this.parts.splice(0, this.parts.length - 400);
  }

  // caret pixel position via a mirror div
  caretXY() {
    const ta = this.ta;
    if (!this.mirror) {
      this.mirror = document.createElement('div');
      Object.assign(this.mirror.style, { position: 'absolute', visibility: 'hidden', top: '0', left: '-9999px', overflow: 'hidden' });
      document.body.appendChild(this.mirror);
    }
    const m = this.mirror; const cs = getComputedStyle(ta);
    for (const p of ['fontFamily', 'fontSize', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingLeft', 'paddingRight', 'paddingBottom', 'whiteSpace', 'wordBreak', 'overflowWrap', 'boxSizing', 'borderWidth']) m.style[p] = cs[p];
    m.style.width = ta.clientWidth + 'px';
    const pos = ta.selectionStart || 0;
    m.textContent = ta.value.slice(0, pos);
    const span = document.createElement('span'); span.textContent = ta.value.slice(pos, pos + 1) || '.'; m.appendChild(span);
    const x = span.offsetLeft; const y = span.offsetTop - ta.scrollTop + parseFloat(cs.lineHeight || 24) * 0.55;
    return [Math.min(this.w - 4, Math.max(4, x)), Math.min(this.h - 4, Math.max(4, y))];
  }

  draw(dt) {
    const c = this.rc; const d = this.dpr;
    c.setTransform(d, 0, 0, d, 0, 0);
    c.fillStyle = 'rgba(0,10,3,0.16)'; c.fillRect(0, 0, this.w, this.h);
    c.font = '15px "Share Tech Mono", monospace'; c.textAlign = 'center';
    this.cols.forEach((col, i) => {
      col.y += col.v * dt;
      if (col.y > this.h + 40) { col.y = -20 - Math.random() * 200; col.v = 40 + Math.random() * 90; }
      const step = Math.floor(col.y / 18);
      if (step !== col.step) {
        col.step = step;
        let g = col.inject || (this.typed.length && Math.random() < 0.3 ? this.typed[(Math.random() * this.typed.length) | 0] : GLYPHS[(Math.random() * GLYPHS.length) | 0]);
        const injected = !!col.inject; col.inject = null;
        c.fillStyle = injected ? '#ffffff' : 'rgba(57,255,122,0.85)';
        c.fillText(g, i * 16 + 8, step * 18);
      }
    });
    const s = this.sc;
    s.setTransform(d, 0, 0, d, 0, 0); s.clearRect(0, 0, this.w, this.h);
    s.globalCompositeOperation = 'lighter';
    this.parts = this.parts.filter((p) => (p.age += dt) < p.life);
    for (const p of this.parts) {
      p.vy += 300 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      const a = 1 - p.age / p.life;
      s.fillStyle = `hsla(${p.hue},100%,65%,${a})`; s.beginPath(); s.arc(p.x, p.y, 2.2, 0, 6.3); s.fill();
    }
    s.globalCompositeOperation = 'source-over';
  }

  // ---------- key bar ----------
  buildKeybar() {
    const bar = document.getElementById('keybar');
    const keys = [
      ['◀', 'left'], ['▶', 'right'], ['▲', 'up'], ['▼', 'down'], ['⏎', '\n'],
      '!', '?', '~', '(', ')', '[', ']', '{', '}', '#', '*', '@', '&', '%', '$', '^', ':', '.', '"', '<', '>', '|', '/', '-', '+', '=',
      '🐶', '🐾', '💥', '🔥', '🌈', '❤️', '⭐', '✨', '🚀', '👻', '🦄', '🦖', '🎵', '🌀', '💻', '🐿️', '🎾', '🦴', '💩', '🍕',
    ];
    for (const k of keys) {
      const b = document.createElement('button');
      const [label, val] = Array.isArray(k) ? k : [k, k];
      b.textContent = label; b.type = 'button';
      if (Array.isArray(k)) b.className = 'nav';
      // keep focus in the textarea so the phone keyboard stays open
      b.addEventListener('pointerdown', (e) => e.preventDefault());
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => this.key(val));
      bar.appendChild(b);
    }
  }

  key(val) {
    const ta = this.ta;
    if (val === 'left' || val === 'right') {
      const p = ta.selectionStart + (val === 'left' ? -1 : 1);
      const q = Math.max(0, Math.min(ta.value.length, p));
      ta.setSelectionRange(q, q);
    } else if (val === 'up' || val === 'down') {
      const v = ta.value; const p = ta.selectionStart;
      const ls = v.lastIndexOf('\n', p - 1) + 1; const col = p - ls;
      let q;
      if (val === 'up') { if (ls === 0) q = 0; else { const ps = v.lastIndexOf('\n', ls - 2) + 1; q = Math.min(ps + col, ls - 1); } }
      else { const le = v.indexOf('\n', p); if (le < 0) q = v.length; else { const ne = v.indexOf('\n', le + 1); q = Math.min(le + 1 + col, ne < 0 ? v.length : ne); } }
      ta.setSelectionRange(q, q);
    } else {
      this.insert(val);
      return;
    }
    ta.focus({ preventScroll: true });
    const [x, y] = this.caretXY(); this.burst(x, y, 'a');
  }

  insert(text) {
    const ta = this.ta;
    const s = ta.selectionStart, e = ta.selectionEnd;
    ta.setRangeText(text, s, e, 'end');
    ta.focus({ preventScroll: true });
    this.input({ data: text });
  }
}
