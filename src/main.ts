// App shell: layout (phone / split view), the editor, running and stopping, the drawer, mode switching.
// Everything mode specific comes from the ModeDef registry in src/modes/.
import './fonts.css';
import './styles/global.css';
import { AudioEngine } from './engine/audio';
import type { TypingKind } from './engine/audio';
import { $, localize } from './ui/dom';
import { Editor } from './ui/editor';
import { store } from './ui/storage';
import { pawMash } from './ui/paw';
import { keyInfo } from './lang/keys';
import { graphemes } from './lang/lexer';
import { VERSION_LABEL, BUILD_TIME } from './version';
import { t, langPref, setLangPref, systemLang, LANG_NAMES } from './i18n';
import type { LangPref } from './i18n';
import { MODES, modeById, nextMode } from './modes';
import type { ModeDef, ModePlayer } from './modes/types';

localize();
const app = $('app');
const audio = new AudioEngine();

const ver = $('version');
ver.textContent = VERSION_LABEL;
ver.title = t('built', { time: BUILD_TIME });

// ---- keep the layout above the on-screen keyboard ----
// The app normally fills the screen via CSS (inset: 0), which is what an installed iOS web app
// reports most reliably. Only while the keyboard covers part of it do we pin it to the visible area.
let fullH = 0, fullW = 0;
function fitViewport(): void {
  const vv = window.visualViewport;
  const h = vv ? vv.height : window.innerHeight;
  const w = vv ? vv.width : window.innerWidth;
  if (w !== fullW) { fullW = w; fullH = 0; } // rotated: forget the old height
  fullH = Math.max(fullH, h);
  const kbd = h < fullH - 120;
  const root = document.documentElement.style;
  root.setProperty('--vh', h + 'px');
  root.setProperty('--vt', (kbd && vv ? vv.offsetTop : 0) + 'px');
  if (window.scrollY) window.scrollTo(0, 0);
  app.classList.toggle('kbd', kbd);
  // squeeze the header a bit while typing
  app.classList.toggle('kb', kbd && document.activeElement?.id === 'code');
}
window.visualViewport?.addEventListener('resize', fitViewport);
window.visualViewport?.addEventListener('scroll', fitViewport);
window.addEventListener('resize', fitViewport);
window.addEventListener('orientationchange', () => { fullH = 0; setTimeout(fitViewport, 300); });
fitViewport();

// the first touch unlocks audio; later touches revive it (iOS suspends it after calls, Siri, app switches)
const unlock = () => { audio.init(); };
window.addEventListener('pointerdown', unlock, { capture: true });
window.addEventListener('keydown', unlock, { capture: true });

// keep the screen awake while a program plays
let wake: { release(): Promise<void> } | null = null;
async function keepAwake(on: boolean): Promise<void> {
  try {
    if (on && !wake && 'wakeLock' in navigator) wake = await navigator.wakeLock.request('screen');
    if (!on && wake) { const w = wake; wake = null; await w.release(); }
  } catch (e) { wake = null; /* not allowed or not supported */ }
}

// v0.2.0 registered a caching service worker; it is gone again. Clean up after it.
try {
  navigator.serviceWorker?.getRegistrations().then((rs) => rs.forEach((r) => void r.unregister())).catch(() => {});
  if ('caches' in window) caches.keys().then((ks) => ks.forEach((k) => void caches.delete(k))).catch(() => {});
} catch (e) { /* not available here */ }

// ---- the current mode and its player (created on first use) ----
let mode: ModeDef = modeById(store.mode);
const players = new Map<string, ModePlayer>();
function P(): ModePlayer {
  let p = players.get(mode.id);
  if (!p) { p = mode.player(audio); players.set(mode.id, p); }
  return p;
}

// ---- status line ----
function status(src: string): void {
  const s = mode.status(src);
  $('st-ok').textContent = s.ok;
  $('st-threads').textContent = String(s.count);
  $('st-unit').textContent = s.unit;
  $('st-glyphs').textContent = String(graphemes(src).length);
}

let saveTimer: ReturnType<typeof setTimeout> | undefined, swapTimer: ReturnType<typeof setTimeout> | undefined;
const state = { playing: false };
const editor = new Editor({
  onChange: (v) => {
    if (v && clearBtn.classList.contains('undo')) armUndo(false);
    status(v); clearTimeout(saveTimer); saveTimer = setTimeout(() => store.setDraft(v), 400);
    // live coding: in split view, edits go straight into the running program
    if (state.playing && isSplit()) { clearTimeout(swapTimer); swapTimer = setTimeout(() => P().hotSwap(editor.value), 650); }
  },
  onType: (ch, inputType) => {
    // laid-back sounds while typing, pitched by where the key sits
    if (!audio.ctx) return;
    const quiet = state.playing; // don't fight the running program
    let kind: TypingKind = 'letter';
    if (inputType.startsWith('delete')) kind = 'delete';
    else if (ch === '\n' || inputType === 'insertLineBreak' || inputType === 'insertParagraph') kind = 'enter';
    else if (ch === ' ') kind = 'space';
    else if (/\p{Extended_Pictographic}/u.test(ch)) kind = 'emoji';
    else if (/\p{Nd}/u.test(ch)) kind = 'digit';
    else if (!/\p{L}/u.test(ch)) kind = 'symbol';
    const key = keyInfo(ch || 'a');
    audio.typing(kind, key.deg, (key.x - 0.5) * 1.4, quiet);
  },
});

function isSplit(): boolean { return app.classList.contains('split'); }
function layout(): void {
  // side by side needs room in both directions: tablets and desktops, not a phone on its side
  const split = window.innerWidth >= 820 && window.innerHeight >= 560 && window.innerWidth > window.innerHeight * 1.05;
  app.classList.toggle('split', split);
  app.classList.toggle('playing', state.playing);
  if (split) { $('edit').hidden = false; $('play').hidden = false; }
  else { $('edit').hidden = state.playing; $('play').hidden = !state.playing; }
  editor.active = !$('edit').hidden;
  const rb = $('btn-run');
  rb.querySelector('i')!.textContent = split && state.playing ? '■' : '▶';
  rb.querySelector('span')!.textContent = t(split && state.playing ? 'stop' : 'run');
  requestAnimationFrame(() => { editor.resize(); P().fit(); });
}
window.addEventListener('resize', layout);

// CLEAR turns into UNDO for a few seconds; a draining fill inside the button is the countdown
const UNDO_MS = 6000;
let undo = '', undoTimer: ReturnType<typeof setTimeout> | undefined;
const clearBtn = $('btn-clear');
function armUndo(on: boolean): void {
  clearTimeout(undoTimer);
  clearBtn.classList.remove('undo');
  clearBtn.querySelector('i')!.textContent = on ? '↶' : '✖';
  clearBtn.querySelector('span')!.textContent = t(on ? 'undo' : 'clear');
  if (!on) return;
  void clearBtn.offsetWidth; // restart the countdown animation
  clearBtn.style.setProperty('--undo-ms', UNDO_MS + 'ms');
  clearBtn.classList.add('undo');
  undoTimer = setTimeout(() => armUndo(false), UNDO_MS);
}
clearBtn.addEventListener('click', () => {
  if (clearBtn.classList.contains('undo')) { editor.value = undo; armUndo(false); editor.ta.focus({ preventScroll: true }); return; }
  if (!editor.value) return;
  undo = editor.value;
  editor.value = '';
  armUndo(true);
});

// ---- modes ----
function applyMode(m: ModeDef): void {
  const root = document.documentElement;
  for (const other of MODES) root.classList.remove(other.theme);
  mode = m; store.setMode(m.id);
  root.classList.add(m.theme);
  const logo = document.querySelector<HTMLElement>('header .logo')!;
  logo.textContent = m.name; logo.dataset.text = m.name;
  $('mode-icon').innerHTML = m.icon;
  document.title = `${m.name} — ${m.tagline}`;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', m.themeColor);
  editor.configure(m.backdrop(), m.keys);
  armUndo(false);
  audio.typingStyle = m.typing;
  const draft = store.draft();
  editor.value = draft !== null ? draft : m.demos[0]!.src;
}
function switchMode(m: ModeDef): void {
  if (m === mode) return;
  store.setDraft(editor.value);
  if (state.playing) edit();
  audio.padStop();
  applyMode(m);
  transition();
  toast(`${m.name} · ${m.tagline}`);
}
// tap the icon (or the logo) in the header: the next mode
for (const el of [$('mode-icon'), document.querySelector<HTMLElement>('header .logo')!]) {
  el.addEventListener('click', () => switchMode(nextMode(mode)));
}
applyMode(mode);

/** the mode's own animation: switching in, starting and stopping a program */
function transition(): void {
  app.classList.remove(mode.transition); void app.offsetWidth; app.classList.add(mode.transition);
}

function run(): void {
  if (state.playing && isSplit()) { edit(); return; }
  let src = editor.value;
  if (!src.trim()) { src = pawMash(70); editor.value = src; toast(mode.emptyToast); }
  audio.padStop();
  if (!isSplit()) editor.ta.blur();
  transition();
  state.playing = true;
  void keepAwake(true);
  layout();
  requestAnimationFrame(() => void P().start(src));
}
function edit(): void {
  P().stop();
  if (!isSplit()) transition();
  state.playing = false;
  void keepAwake(false);
  layout();
}

$('btn-run').addEventListener('click', run);
$('btn-idle-run').addEventListener('click', run);
$('btn-stop').addEventListener('click', edit);
$('btn-restart').addEventListener('click', () => P().restart());
function toggleMute(): void {
  audio.init();
  audio.setMuted(!audio.muted);
  for (const id of ['btn-mute', 'btn-mute-edit']) $(id).textContent = audio.muted ? '🔇' : '🔊';
}
$('btn-mute').addEventListener('click', toggleMute);
$('btn-mute-edit').addEventListener('click', toggleMute);
layout();
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

$('btn-save').addEventListener('click', () => {
  const n = store.save(editor.value);
  toast(n ? t('saved', { n: String(n).padStart(2, '0') }) : t('storageBlocked'));
});
$('btn-load').addEventListener('click', openDrawer);
$('drawer-close').addEventListener('click', () => { $('drawer').hidden = true; });
$('drawer').addEventListener('click', (e) => { if (e.target === $('drawer')) $('drawer').hidden = true; });

// ---- the program drawer ----
function item(name: string, sub: string, onLoad: () => void, onDel?: () => void): HTMLDivElement {
  const row = document.createElement('div'); row.className = 'item';
  const b = document.createElement('button'); b.className = 'name';
  b.textContent = name;
  const sm = document.createElement('small'); sm.textContent = sub; b.appendChild(sm);
  b.addEventListener('click', onLoad); row.appendChild(b);
  if (onDel) { const d = document.createElement('button'); d.className = 'del'; d.textContent = '✖'; d.addEventListener('click', onDel); row.appendChild(d); }
  return row;
}

/** a native select dressed like the drawer buttons */
function picker<T extends string>(label: string, options: [T, string][], value: T, onPick: (v: T) => void): HTMLLabelElement {
  const box = document.createElement('label'); box.className = 'pick';
  const sel = document.createElement('select'); sel.setAttribute('aria-label', label); sel.title = label;
  for (const [v, name] of options) {
    const o = document.createElement('option'); o.value = v; o.textContent = name; o.selected = v === value;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => onPick(sel.value as T));
  box.appendChild(sel);
  return box;
}

function heading(text: string): HTMLHeadingElement {
  const h = document.createElement('h4'); h.textContent = text; return h;
}

function openDrawer(): void {
  const body = $('drawer-body'); body.innerHTML = '';
  const load = (src: string) => () => { editor.value = src; $('drawer').hidden = true; toast(t('loaded')); };
  body.appendChild(heading(t('mode')));
  body.appendChild(picker(t('switchHint'), MODES.map((m): [string, string] => [m.id, `${m.glyph} ${m.name} — ${m.tagline}`]), mode.id, (id) => {
    $('drawer').hidden = true; switchMode(modeById(id));
  }));
  body.appendChild(heading(t('demos')));
  for (const d of mode.demos) body.appendChild(item(d.name, d.src.replace(/\n/g, ' ⏎ '), load(d.src)));
  body.appendChild(heading(t('savedHere')));
  const slots = store.slots();
  if (!slots.length) { const p = document.createElement('div'); p.className = 'empty'; p.textContent = t('nothingSaved'); body.appendChild(p); }
  slots.forEach((s, i) => body.appendChild(item(s.name, new Date(s.t).toLocaleString() + ' · ' + s.src.replace(/\n/g, ' ⏎ '), load(s.src), () => { store.remove(i); openDrawer(); })));
  for (const sec of mode.drawer?.({ audio, item, refresh: openDrawer }) ?? []) {
    body.appendChild(heading(sec.title));
    for (const el of sec.items) body.appendChild(el);
  }
  body.appendChild(heading(t('share')));
  body.appendChild(item(t('copy'), t('copySub'), async () => {
    try { await navigator.clipboard.writeText(editor.value); toast(t('copied')); } catch (e) { toast(t('copyBlocked')); }
  }));
  body.appendChild(heading('APP · ' + VERSION_LABEL));
  // settings share one row: reload on the left, language on the right
  const settings = item(t('reload'), t('reloadSub'), reloadApp); settings.classList.add('split');
  const langs: [LangPref, string][] = [['auto', '🌐 ' + t('langAuto', { name: LANG_NAMES[systemLang] })], ['en', '🌐 ' + LANG_NAMES.en], ['de', '🌐 ' + LANG_NAMES.de]];
  // every string is resolved at startup, so a change reloads (the text is kept)
  settings.appendChild(picker(t('language'), langs, langPref, (p) => { setLangPref(p); reloadApp(); }));
  body.appendChild(settings);
  $('drawer').hidden = false;
}

/** Reload, for the home-screen app that has no reload button. The text survives as the draft. */
function reloadApp(): void {
  store.setDraft(editor.value);
  P().stop();
  // a fresh query string makes the installed app fetch the page again instead of reusing its copy
  const framed = window.top !== window;
  if (!framed && /^https?:$/.test(location.protocol)) location.replace(location.pathname + '?r=' + Date.now().toString(36));
  else location.reload();
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function toast(text: string): void {
  const t = $('toast'); t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 1800);
}

// pause audio when the page is hidden
document.addEventListener('visibilitychange', () => {
  if (!audio.ctx) return;
  if (document.hidden) audio.ctx.suspend().catch(() => {}); else audio.ctx.resume().catch(() => {});
  if (!document.hidden && state.playing) { wake = null; void keepAwake(true); } // the lock is dropped when hidden
});

// handle for debugging and the browser tests
const KEYMASH = { editor, players, audio, run, edit, state, switchMode: (id?: string) => switchMode(id ? modeById(id) : nextMode(mode)), get player() { return P(); }, get mode() { return mode.id; } };
declare global { interface Window { KEYMASH: typeof KEYMASH } }
window.KEYMASH = KEYMASH;

// everything is up: take the "waiting for JavaScript" message away
document.getElementById('nojs')?.remove();
