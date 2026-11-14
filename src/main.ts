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
import { KmMute, KmItem, KmSelect, KmDrawer, KmCard } from './ui/components';
import type { KmButton, KmModeIcon, KmToast } from './ui/components';

localize();
const app = $('app');
const audio = new AudioEngine();

const ver = $('version');
ver.textContent = VERSION_LABEL;
ver.title = t('built', { time: BUILD_TIME });

// ---- keep the layout above the on-screen keyboard ----
// The app normally fills the screen via CSS (inset: 0), which is what an installed iOS web app
// reports most reliably. Only while the keyboard covers part of it do we pin it to the visible area.
let fullH = 0,
  fullW = 0;
function fitViewport(): void {
  const vv = window.visualViewport;
  const h = vv ? vv.height : window.innerHeight;
  const w = vv ? vv.width : window.innerWidth;
  if (w !== fullW) {
    fullW = w;
    fullH = 0;
  } // rotated: forget the old height
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
window.addEventListener('orientationchange', () => {
  fullH = 0;
  setTimeout(fitViewport, 300);
});
fitViewport();

// the first touch unlocks audio; later touches revive it (iOS suspends it after calls, Siri, app switches)
const unlock = () => {
  audio.init();
};
window.addEventListener('pointerdown', unlock, { capture: true });
window.addEventListener('keydown', unlock, { capture: true });

// keep the screen awake while a program plays
let wake: { release(): Promise<void> } | null = null;
async function keepAwake(on: boolean): Promise<void> {
  try {
    if (on && !wake && 'wakeLock' in navigator) wake = await navigator.wakeLock.request('screen');
    if (!on && wake) {
      const w = wake;
      wake = null;
      await w.release();
    }
  } catch (e) {
    wake = null; /* not allowed or not supported */
  }
}

// v0.2.0 registered a caching service worker; it is gone again. Clean up after it.
try {
  navigator.serviceWorker
    ?.getRegistrations()
    .then((rs) => rs.forEach((r) => void r.unregister()))
    .catch(() => {});
  if ('caches' in window)
    caches
      .keys()
      .then((ks) => ks.forEach((k) => void caches.delete(k)))
      .catch(() => {});
} catch (e) {
  /* not available here */
}

// ---- the current mode and its player (created on first use) ----
let mode: ModeDef = modeById(store.mode);
const players = new Map<string, ModePlayer>();
function P(): ModePlayer {
  let p = players.get(mode.id);
  if (!p) {
    p = mode.player(audio);
    players.set(mode.id, p);
  }
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
    status(v);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => store.setDraft(v), 400);
    // live coding: in split view, edits go straight into the running program
    if (state.playing && isSplit()) {
      clearTimeout(swapTimer);
      swapTimer = setTimeout(() => P().hotSwap(editor.value), 650);
    }
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

function isSplit(): boolean {
  return app.classList.contains('split');
}
function layout(): void {
  // side by side needs room in both directions: tablets and desktops, not a phone on its side
  const split = window.innerWidth >= 820 && window.innerHeight >= 560 && window.innerWidth > window.innerHeight * 1.05;
  app.classList.toggle('split', split);
  app.classList.toggle('playing', state.playing);
  if (split) {
    $('edit').hidden = false;
    $('play').hidden = false;
  } else {
    $('edit').hidden = state.playing;
    $('play').hidden = !state.playing;
  }
  editor.active = !$('edit').hidden;
  const rb = $<KmButton>('btn-run');
  rb.icon = split && state.playing ? '■' : '▶';
  rb.text = t(split && state.playing ? 'stop' : 'run');
  requestAnimationFrame(() => {
    editor.resize();
    P().fit();
  });
}
window.addEventListener('resize', layout);

// CLEAR turns into UNDO for a few seconds; a draining fill inside the button is the countdown
const UNDO_MS = 6000;
let undo = '';
const clearBtn = $<KmButton>('btn-clear');
function armUndo(on: boolean): void {
  clearBtn.icon = on ? '↶' : '✖';
  clearBtn.text = t(on ? 'undo' : 'clear');
  clearBtn.countdown(on ? UNDO_MS : 0, () => armUndo(false));
}
clearBtn.addEventListener('click', () => {
  if (clearBtn.counting) {
    editor.value = undo;
    armUndo(false);
    editor.ta.focus({ preventScroll: true });
    return;
  }
  if (!editor.value) return;
  undo = editor.value;
  editor.value = '';
  armUndo(true);
});

// ---- modes ----
function applyMode(m: ModeDef): void {
  const root = document.documentElement;
  for (const other of MODES) root.classList.remove(other.theme);
  mode = m;
  store.setMode(m.id);
  root.classList.add(m.theme);
  const logo = document.querySelector<HTMLElement>('header .logo')!;
  logo.textContent = m.name;
  logo.dataset.text = m.name;
  $<KmModeIcon>('mode-icon').mode = m;
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
$('mode-icon').addEventListener('next', () => switchMode(nextMode(mode)));
document.querySelector<HTMLElement>('header .logo')!.addEventListener('click', () => switchMode(nextMode(mode)));
applyMode(mode);

/** the mode's own animation: switching in, starting and stopping a program */
function transition(): void {
  // another mode's class may still be on #app; its animation would win over this one
  for (const m of MODES) app.classList.remove(m.transition);
  void app.offsetWidth;
  app.classList.add(mode.transition);
}

function run(): void {
  if (state.playing && isSplit()) {
    edit();
    return;
  }
  let src = editor.value;
  if (!src.trim()) {
    src = pawMash(70);
    editor.value = src;
    toast(mode.emptyToast);
  }
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

// ⛶ in the stage corner: only the picture, the rest of the UI hides. Where the browser allows it
// (not on iPhone, not in some embeds) the page goes fullscreen too.
const fullBtn = $<KmButton>('btn-full');
function stageOnly(on: boolean): void {
  app.classList.toggle('stageonly', on);
  fullBtn.icon = on ? '✖' : '⛶';
  if (on && document.fullscreenEnabled && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
  if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
}
fullBtn.addEventListener('click', () => stageOnly(!app.classList.contains('stageonly')));
// Esc or a system gesture left fullscreen: bring the UI back as well
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) stageOnly(false);
});
KmMute.audio = audio;
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
    const chunk = chars.slice(i, i + n).join('');
    i += n;
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

// ---- the cheat sheet (📖 next to the sound button): the current mode's cards ----
// A tap adds the card's snippet as a new last line; the sheet stays open for more.
function addLine(code: string): void {
  const ta = editor.ta,
    end = ta.value.length;
  const add = (ta.value && !ta.value.endsWith('\n') ? '\n' : '') + code;
  ta.setRangeText(add, end, end, 'end'); // no focus: on a phone that would open the keyboard over the sheet
  editor.input({ data: add });
  ta.scrollTop = ta.scrollHeight;
  toast(t('added', { code }));
}
$('btn-sheet').addEventListener('click', () => {
  $<KmDrawer>('sheet').open([KmCard.intro(mode.sheet.intro), KmCard.grid(mode.sheet.cards, addLine)]);
});

// ---- the program drawer ----
const drawer = $<KmDrawer>('drawer');
const item = (name: string, sub: string, onPick: () => void, onDelete?: () => void) => KmItem.create({ name, sub, onPick, onDelete });

function openDrawer(): void {
  const load = (src: string) => () => {
    editor.value = src;
    drawer.close();
    toast(t('loaded'));
  };
  const nodes: Node[] = [
    KmDrawer.heading(t('mode')),
    KmSelect.create({
      label: t('switchHint'),
      value: mode.id,
      options: MODES.map((m) => [m.id, `${m.glyph} ${m.name} — ${m.tagline}`] as const),
      onPick: (id) => {
        drawer.close();
        switchMode(modeById(id));
      },
    }),
    KmDrawer.heading(t('demos')),
    ...mode.demos.map((d) => item(d.name, d.src.replace(/\n/g, ' ⏎ '), load(d.src))),
    KmDrawer.heading(t('savedHere')),
  ];
  const slots = store.slots();
  if (!slots.length) nodes.push(KmDrawer.empty(t('nothingSaved')));
  slots.forEach((s, i) =>
    nodes.push(
      item(s.name, new Date(s.t).toLocaleString() + ' · ' + s.src.replace(/\n/g, ' ⏎ '), load(s.src), () => {
        store.remove(i);
        openDrawer();
      }),
    ),
  );
  for (const sec of mode.drawer?.({ audio, item, refresh: openDrawer }) ?? []) nodes.push(KmDrawer.heading(sec.title), ...sec.items);
  nodes.push(
    KmDrawer.heading(t('share')),
    item(t('copy'), t('copySub'), async () => {
      try {
        await navigator.clipboard.writeText(editor.value);
        toast(t('copied'));
      } catch (e) {
        toast(t('copyBlocked'));
      }
    }),
  );
  // settings share one row: reload on the left, language on the right;
  // every string is resolved at startup, so a language change reloads (the text is kept)
  const langs = [
    ['auto', '🌐 ' + t('langAuto', { name: LANG_NAMES[systemLang] })],
    ['en', '🌐 ' + LANG_NAMES.en],
    ['de', '🌐 ' + LANG_NAMES.de],
  ] as const;
  nodes.push(
    KmDrawer.heading('APP · ' + VERSION_LABEL),
    KmDrawer.split(
      item(t('reload'), t('reloadSub'), reloadApp),
      KmSelect.create<LangPref>({
        label: t('language'),
        options: langs,
        value: langPref,
        onPick: (p) => {
          setLangPref(p);
          reloadApp();
        },
      }),
    ),
  );
  drawer.open(nodes);
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

function toast(text: string): void {
  $<KmToast>('toast').show(text);
}

// pause audio when the page is hidden
document.addEventListener('visibilitychange', () => {
  if (!audio.ctx) return;
  if (document.hidden) audio.ctx.suspend().catch(() => {});
  else audio.ctx.resume().catch(() => {});
  if (!document.hidden && state.playing) {
    wake = null;
    void keepAwake(true);
  } // the lock is dropped when hidden
});

// handle for debugging and the browser tests
const KEYMASH = {
  editor,
  players,
  audio,
  run,
  edit,
  state,
  switchMode: (id?: string) => switchMode(id ? modeById(id) : nextMode(mode)),
  get player() {
    return P();
  },
  get mode() {
    return mode.id;
  },
};
declare global {
  interface Window {
    KEYMASH: typeof KEYMASH;
  }
}
window.KEYMASH = KEYMASH;

// everything is up: take the "waiting for JavaScript" message away
document.getElementById('nojs')?.remove();
