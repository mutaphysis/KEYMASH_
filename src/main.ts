import './fonts.css';
import './style.css';
import { AudioEngine } from './engine/audio';
import type { TypingKind, VoiceMode } from './engine/audio';
import { $, localize } from './ui/dom';
import { Editor } from './ui/editor';
import { Player } from './ui/player';
import { store, DEMOS, PETRI_DEMOS, pawMash } from './ui/storage';
import type { Mode } from './ui/storage';
import { MicroPlayer } from './micro/player';
import { readCulture } from './micro/genome';
import { lex } from './lang/lexer';
import { keyInfo } from './lang/keys';
import { VERSION_LABEL, BUILD_TIME } from './version';
import { t, tn, langPref, setLangPref, systemLang, LANG_NAMES } from './i18n';
import type { LangPref } from './i18n';

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

// ---- status line ----
function status(src: string): void {
  if (mode === 'petri') {
    const c = readCulture(src);
    $('st-ok').textContent = t('alive');
    $('st-threads').textContent = String(c.species.length);
    $('st-unit').textContent = tn('species', c.species.length);
    $('st-glyphs').textContent = String(c.gs.length);
    return;
  }
  const L = lex(src);
  const threads = L.lines.filter((t) => t.some((x) => x.t !== 'space')).length;
  $('st-ok').textContent = t('errors0');
  $('st-threads').textContent = String(threads);
  $('st-unit').textContent = t('threads');
  $('st-glyphs').textContent = String(L.gs.length);
}

// ---- two modes, two players on the same stage ----
let mode: Mode = store.mode;

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
const players = { keymash: new Player(audio), petri: new MicroPlayer(audio) };
const P = (): Player | MicroPlayer => players[mode];

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

const demos = () => (mode === 'petri' ? PETRI_DEMOS : DEMOS);
function applyMode(m: Mode): void {
  mode = m; store.setMode(m);
  app.classList.toggle('petri', m === 'petri');
  const logo = document.querySelector<HTMLElement>('header .logo')!;
  logo.textContent = m === 'petri' ? 'PETRI_' : 'KEYMASH_'; logo.dataset.text = logo.textContent;
  document.title = m === 'petri' ? `PETRI_ — ${t('tagPetri')}` : `KEYMASH_ — ${t('tagKeymash')}`;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', m === 'petri' ? '#010a0d' : '#000800');
  editor.setMode(m);
  armUndo(false);
  audio.typingStyle = m === 'petri' ? 'water' : 'lounge';
  const draft = store.draft();
  editor.value = draft !== null ? draft : demos()[0]!.src;
}
/** double-tap the icon (or the logo) in the header */
function switchMode(): void {
  store.setDraft(editor.value);
  if (state.playing) edit();
  audio.padStop();
  applyMode(mode === 'petri' ? 'keymash' : 'petri');
  if (mode === 'petri') { app.classList.remove('focusing'); void app.offsetWidth; app.classList.add('focusing'); }
  else glitchSwitch();
  toast(mode === 'petri' ? `PETRI_ · ${t('tagPetri')}` : `KEYMASH_ · ${t('tagKeymash')}`);
}
let lastTap = 0;
for (const el of [$('mode-icon'), document.querySelector<HTMLElement>('header .logo')!]) {
  el.addEventListener('pointerup', (e) => {
    const t = e.timeStamp;
    if (t - lastTap < 450) { lastTap = 0; switchMode(); } else lastTap = t;
  });
  el.addEventListener('dblclick', (e) => e.preventDefault());
}
applyMode(mode);

// ---- mode switching ----
function glitchSwitch(): void {
  const cls = mode === 'petri' ? 'focusing' : 'switching';
  app.classList.remove(cls); void app.offsetWidth; app.classList.add(cls);
}

function run(): void {
  if (state.playing && isSplit()) { edit(); return; }
  let src = editor.value;
  if (!src.trim()) { src = pawMash(70); editor.value = src; toast(t(mode === 'petri' ? 'emptyPetri' : 'emptyKeymash')); }
  audio.padStop();
  if (!isSplit()) editor.ta.blur();
  glitchSwitch();
  state.playing = true;
  void keepAwake(true);
  layout();
  requestAnimationFrame(() => void P().start(src));
}
function edit(): void {
  P().stop();
  if (!isSplit()) glitchSwitch();
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

function item(name: string, sub: string, onLoad: () => void, onDel?: () => void): HTMLDivElement {
  const row = document.createElement('div'); row.className = 'item';
  const b = document.createElement('button'); b.className = 'name';
  b.textContent = name;
  const sm = document.createElement('small'); sm.textContent = sub; b.appendChild(sm);
  b.addEventListener('click', onLoad); row.appendChild(b);
  if (onDel) { const d = document.createElement('button'); d.className = 'del'; d.textContent = '✖'; d.addEventListener('click', onDel); row.appendChild(d); }
  return row;
}

function openDrawer(): void {
  const body = $('drawer-body'); body.innerHTML = '';
  const load = (src: string) => () => { editor.value = src; $('drawer').hidden = true; toast(t('loaded')); };
  const h1 = document.createElement('h4'); h1.textContent = t('demos'); body.appendChild(h1);
  for (const d of demos()) body.appendChild(item(d.name, d.src.replace(/\n/g, ' ⏎ '), load(d.src)));
  const h2 = document.createElement('h4'); h2.textContent = t('savedHere'); body.appendChild(h2);
  const slots = store.slots();
  if (!slots.length) { const p = document.createElement('div'); p.style.cssText = 'opacity:.5;font-size:13px;padding:6px 2px'; p.textContent = t('nothingSaved'); body.appendChild(p); }
  slots.forEach((s, i) => body.appendChild(item(s.name, new Date(s.t).toLocaleString() + ' · ' + s.src.replace(/\n/g, ' ⏎ '), load(s.src), () => { store.remove(i); openDrawer(); })));
  const hm = document.createElement('h4'); hm.textContent = t('mode'); body.appendChild(hm);
  body.appendChild(item(t('switchTo', { app: mode === 'petri' ? 'KEYMASH_' : 'PETRI_' }), t('switchHint'), () => { $('drawer').hidden = true; switchMode(); }));
  const hv = document.createElement('h4'); hv.textContent = t('voice'); if (mode === 'keymash') body.appendChild(hv);
  const voices: [VoiceMode, string, string][] = [
    ['system', t('voiceSystem'), t('voiceSystemSub')],
    ['babble', t('voiceBabble'), t('voiceBabbleSub')],
  ];
  if (mode === 'keymash') for (const [vm, name, sub] of voices) {
    body.appendChild(item((audio.voice === vm ? '✓ ' : '') + name, sub, () => {
      audio.setVoice(vm); audio.init();
      setTimeout(() => audio.speak(t('voiceHello'), 1, 1), 150);
      openDrawer();
    }));
  }
  const h3 = document.createElement('h4'); h3.textContent = t('share'); body.appendChild(h3);
  body.appendChild(item(t('copy'), t('copySub'), async () => {
    try { await navigator.clipboard.writeText(editor.value); toast(t('copied')); } catch (e) { toast(t('copyBlocked')); }
  }));
  const ha = document.createElement('h4'); ha.textContent = 'APP · ' + VERSION_LABEL; body.appendChild(ha);
  // settings share one row: reload on the left, language on the right
  const settings = item(t('reload'), t('reloadSub'), reloadApp); settings.classList.add('split');
  settings.appendChild(langPicker()); body.appendChild(settings);
  $('drawer').hidden = false;
}

/** auto / English / Deutsch; every string is resolved at startup, so a change reloads (the text is kept) */
function langPicker(): HTMLLabelElement {
  const box = document.createElement('label'); box.className = 'langpick';
  const sel = document.createElement('select'); sel.setAttribute('aria-label', t('language'));
  const opts: [LangPref, string][] = [['auto', t('langAuto', { name: LANG_NAMES[systemLang] })], ['en', LANG_NAMES.en], ['de', LANG_NAMES.de]];
  for (const [p, name] of opts) {
    const o = document.createElement('option'); o.value = p; o.textContent = '🌐 ' + name; o.selected = p === langPref;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => { setLangPref(sel.value as LangPref); reloadApp(); });
  box.appendChild(sel);
  return box;
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
function toast(text: string, action?: string, fn?: () => void): void {
  const t = $('toast'); t.innerHTML = '';
  const s = document.createElement('span'); s.textContent = text; t.appendChild(s);
  if (action) { const b = document.createElement('button'); b.textContent = action; b.addEventListener('click', () => { fn?.(); t.hidden = true; }); t.appendChild(b); }
  t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, action ? 4000 : 1800);
}

// pause audio when the page is hidden
document.addEventListener('visibilitychange', () => {
  if (!audio.ctx) return;
  if (document.hidden) audio.ctx.suspend().catch(() => {}); else audio.ctx.resume().catch(() => {});
  if (!document.hidden && state.playing) { wake = null; void keepAwake(true); } // the lock is dropped when hidden
});

// handle for debugging and the browser tests
const KEYMASH = { editor, players, audio, run, edit, state, switchMode, get player() { return P(); }, get mode() { return mode; } };
declare global { interface Window { KEYMASH: typeof KEYMASH } }
window.KEYMASH = KEYMASH;

// everything is up: take the "waiting for JavaScript" message away
document.getElementById('nojs')?.remove();
