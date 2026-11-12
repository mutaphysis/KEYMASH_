import { AudioEngine } from './engine/audio.js';
import { Editor } from './ui/editor.js';
import { Player } from './ui/player.js';
import { store, DEMOS, pawMash } from './ui/storage.js';
import { lex } from './lang/lexer.js';

const $ = (id) => document.getElementById(id);
const app = $('app');
const audio = new AudioEngine();

// ---- keep the layout above the on-screen keyboard ----
function fitViewport() {
  const vv = window.visualViewport;
  const h = vv ? vv.height : window.innerHeight;
  const top = vv ? vv.offsetTop : 0;
  document.documentElement.style.setProperty('--vh', h + 'px');
  document.documentElement.style.setProperty('--vt', top + 'px');
  if (window.scrollY) window.scrollTo(0, 0);
}
if (window.visualViewport) {
  visualViewport.addEventListener('resize', fitViewport);
  visualViewport.addEventListener('scroll', fitViewport);
}
window.addEventListener('resize', fitViewport);
fitViewport();

// first touch anywhere unlocks audio
const unlock = () => { audio.init(); };
window.addEventListener('pointerdown', unlock, { once: true, capture: true });
window.addEventListener('keydown', unlock, { once: true, capture: true });

// ---- status line ----
function status(src) {
  const L = lex(src);
  const threads = L.lines.filter((t) => t.some((x) => x.t !== 'space')).length;
  $('st-threads').textContent = threads;
  $('st-glyphs').textContent = L.gs.length;
}

let saveTimer = 0;
const editor = new Editor({
  onChange: (v) => { status(v); clearTimeout(saveTimer); saveTimer = setTimeout(() => store.setDraft(v), 400); },
  onKey: (ch, key) => {
    // every keystroke previews its note, pitched by where the key sits
    if (!audio.ctx || audio.muted) return;
    const sc = [0, 3, 5, 7, 10];
    const d = key.deg; const midi = 57 + sc[((d % 5) + 5) % 5] + 12 * Math.floor(d / 5);
    audio.play({ type: 'note', inst: 'chip', midi, dur: 1, vel: 0.25, pan: (key.x - 0.5) * 1.4 }, audio.now, 0.1);
  },
});
const player = new Player(audio);

const draft = store.draft();
editor.value = draft !== null ? draft : DEMOS[0].src;

// ---- mode switching ----
function glitchSwitch() { app.classList.remove('switching'); void app.offsetWidth; app.classList.add('switching'); }

function run() {
  let src = editor.value;
  if (!src.trim()) { src = pawMash(70); editor.value = src; toast('EMPTY? A PAW TYPED SOMETHING FOR YOU 🐾'); }
  editor.ta.blur();
  glitchSwitch();
  $('edit').hidden = true; $('play').hidden = false;
  editor.active = false;
  requestAnimationFrame(() => player.start(src));
}
function edit() {
  player.stop();
  glitchSwitch();
  $('play').hidden = true; $('edit').hidden = false;
  editor.active = true;
  editor.resize();
}

$('btn-run').addEventListener('click', run);
$('btn-stop').addEventListener('click', edit);
$('btn-restart').addEventListener('click', () => player.restart());
$('btn-mute').addEventListener('click', () => {
  audio.setMuted(!audio.muted);
  $('btn-mute').textContent = audio.muted ? '🔇' : '🔊';
});
$('btn-mash').addEventListener('click', () => {
  audio.init();
  const add = pawMash(24 + Math.random() * 40);
  const v = editor.value;
  const sep = v && !v.endsWith('\n') && !v.endsWith(' ') ? (Math.random() < 0.4 ? '\n' : ' ') : '';
  // type it in, one paw press at a time
  const chars = Array.from(sep + add);
  let i = 0;
  const tick = () => {
    if (i >= chars.length) return;
    const n = 1 + ((Math.random() * 3) | 0);
    const chunk = chars.slice(i, i + n).join(''); i += n;
    editor.ta.setSelectionRange(editor.ta.value.length, editor.ta.value.length);
    editor.ta.setRangeText(chunk, editor.ta.value.length, editor.ta.value.length, 'end');
    editor.input({ data: chunk });
    editor.ta.scrollTop = editor.ta.scrollHeight;
    setTimeout(tick, 25 + Math.random() * 60);
  };
  tick();
});

let undo = null;
$('btn-clear').addEventListener('click', () => {
  undo = editor.value;
  editor.value = '';
  toast('CLEARED', 'UNDO', () => { editor.value = undo; });
});
$('btn-save').addEventListener('click', () => {
  const n = store.save(editor.value);
  toast(n ? `SAVED · SLOT ${String(n).padStart(2, '0')}` : 'STORAGE BLOCKED — COPY IT INSTEAD');
});
$('btn-load').addEventListener('click', openDrawer);
$('drawer-close').addEventListener('click', () => { $('drawer').hidden = true; });
$('drawer').addEventListener('click', (e) => { if (e.target === $('drawer')) $('drawer').hidden = true; });

function item(name, sub, onLoad, onDel) {
  const row = document.createElement('div'); row.className = 'item';
  const b = document.createElement('button'); b.className = 'name';
  b.textContent = name;
  const sm = document.createElement('small'); sm.textContent = sub; b.appendChild(sm);
  b.addEventListener('click', onLoad); row.appendChild(b);
  if (onDel) { const d = document.createElement('button'); d.className = 'del'; d.textContent = '✖'; d.addEventListener('click', onDel); row.appendChild(d); }
  return row;
}

function openDrawer() {
  const body = $('drawer-body'); body.innerHTML = '';
  const load = (src) => () => { editor.value = src; $('drawer').hidden = true; toast('LOADED'); };
  const h1 = document.createElement('h4'); h1.textContent = 'DEMOS'; body.appendChild(h1);
  for (const d of DEMOS) body.appendChild(item(d.name, d.src.replace(/\n/g, ' ⏎ '), load(d.src)));
  const h2 = document.createElement('h4'); h2.textContent = 'SAVED ON THIS DEVICE'; body.appendChild(h2);
  const slots = store.slots();
  if (!slots.length) { const p = document.createElement('div'); p.style.cssText = 'opacity:.5;font-size:13px;padding:6px 2px'; p.textContent = 'nothing yet. press 💾 SAVE.'; body.appendChild(p); }
  slots.forEach((s, i) => body.appendChild(item(s.name, new Date(s.t).toLocaleString() + ' · ' + s.src.replace(/\n/g, ' ⏎ '), load(s.src), () => { store.remove(i); openDrawer(); })));
  const h3 = document.createElement('h4'); h3.textContent = 'SHARE'; body.appendChild(h3);
  body.appendChild(item('📋 copy program text', 'paste it anywhere — any text is a program', async () => {
    try { await navigator.clipboard.writeText(editor.value); toast('COPIED'); } catch (e) { toast('COPY BLOCKED'); }
  }));
  $('drawer').hidden = false;
}

let toastTimer = 0;
function toast(text, action, fn) {
  const t = $('toast'); t.innerHTML = '';
  const s = document.createElement('span'); s.textContent = text; t.appendChild(s);
  if (action) { const b = document.createElement('button'); b.textContent = action; b.addEventListener('click', () => { fn(); t.hidden = true; }); t.appendChild(b); }
  t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, action ? 4000 : 1800);
}

// pause audio when the page is hidden
document.addEventListener('visibilitychange', () => {
  if (!audio.ctx) return;
  if (document.hidden) audio.ctx.suspend().catch(() => {}); else if (player.running) audio.ctx.resume().catch(() => {});
});

window.KEYMASH = { editor, player, audio, run, edit };
