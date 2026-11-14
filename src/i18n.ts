// UI language: the user's choice, else the system's (German when the browser prefers it, English otherwise).
// Each part of the app defines its own messages with `defineMessages(en, de)`: the shared UI here,
// every mode in its own folder. `en` is the reference; tsc checks that `de` covers every id with the same shape.
// A message is a string with {placeholders}, a plural pair, or a list to pick from.

type Plural = { one: string; other: string };
type Entry = string | Plural | readonly string[];
type Vars = Record<string, string | number>;

export type Lang = 'en' | 'de';

/** first supported language in the user's preference order */
export function detectLang(prefs: readonly (string | undefined)[]): Lang {
  for (const p of prefs) {
    const base = p?.split('-')[0]?.toLowerCase();
    if (base === 'de' || base === 'en') return base;
  }
  return 'en';
}

/** 'auto' follows the system; a manual choice is kept in localStorage */
export type LangPref = Lang | 'auto';
const LANG_KEY = 'keymash.lang.v1';

function readPref(): LangPref {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return v === 'en' || v === 'de' ? v : 'auto';
  } catch (e) {
    return 'auto';
  }
}

/** Takes effect on the next load: every string is resolved once, at startup. */
export function setLangPref(p: LangPref): void {
  try {
    if (p === 'auto') localStorage.removeItem(LANG_KEY);
    else localStorage.setItem(LANG_KEY, p);
  } catch (e) {
    /* storage blocked */
  }
}

export const langPref: LangPref = readPref();
const nav = typeof navigator === 'undefined' ? undefined : navigator;
export const systemLang: Lang = detectLang(nav?.languages?.length ? nav.languages : [nav?.language]);
export const lang: Lang = langPref !== 'auto' ? langPref : systemLang;
/** language names are shown in their own language */
export const LANG_NAMES: Record<Lang, string> = { en: 'English', de: 'Deutsch' };

type Shape<T> = T extends string ? string : T extends readonly string[] ? readonly string[] : Plural;
/** the German table must have exactly the ids of the English one, each with the same shape */
export type Translation<E> = { [K in keyof E]: Shape<E[K]> };
type KeysOf<E, T> = { [K in keyof E]: Shape<E[K]> extends T ? K : never }[keyof E] & string;

const plural = new Intl.PluralRules(lang);

function fill(s: string, vars?: Vars): string {
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

export interface Messages<E> {
  /** a plain message */
  t(key: KeysOf<E, string>, vars?: Vars): string;
  /** plural message; `{n}` is filled with the count */
  tn(key: KeysOf<E, Plural>, n: number, vars?: Vars): string;
  /** a list of variants, e.g. for picking one at random */
  tl(key: KeysOf<E, readonly string[]>): readonly string[];
}

export function defineMessages<E extends Record<string, Entry>>(en: E, de: Translation<E>): Messages<E> {
  const M = (lang === 'de' ? de : en) as Record<string, Entry>;
  return {
    t(key, vars) {
      const s = M[key];
      if (typeof s !== 'string') throw new Error(`i18n: no message "${key}"`); // e.g. a typo in a data-i18n attribute
      return fill(s, vars);
    },
    tn(key, n, vars) {
      const p = M[key] as Plural;
      return fill(plural.select(n) === 'one' ? p.one : p.other, { n, ...vars });
    },
    tl(key) {
      return M[key] as readonly string[];
    },
  };
}

// ---------------- the shared UI ----------------

const en = {
  modeAria: 'next mode',
  modeTitle: 'tap for the next mode',
  soundToggle: 'sound on/off',
  placeholder: 'type anything.\nmash the keys.\nlet the dog walk over it.\n\nthere are no errors.',
  extraKeys: 'extra keys',
  run: 'RUN',
  stop: 'STOP',
  mash: 'MASH',
  mashTitle: 'let a virtual paw type',
  clear: 'CLEAR',
  undo: 'UNDO',
  save: 'SAVE',
  load: 'LOAD',
  edit: 'EDIT',
  restart: 'restart',
  idleHint: 'edit on the left — changes go live while it runs',
  programs: '// PROGRAMS',
  built: 'built {time}',
  glyphs: 'GLYPHS',
  saved: 'SAVED · SLOT {n}',
  storageBlocked: 'STORAGE BLOCKED — COPY IT INSTEAD',
  loaded: 'LOADED',
  demos: 'DEMOS',
  savedHere: 'SAVED ON THIS DEVICE',
  nothingSaved: 'nothing yet. press 💾 SAVE.',
  mode: 'MODE',
  switchHint: 'mode — or tap the icon in the header',
  share: 'SHARE',
  copy: '📋 copy program text',
  copySub: 'paste it anywhere — any text is a program',
  copied: 'COPIED',
  copyBlocked: 'COPY BLOCKED',
  reload: '⟳ reload app',
  reloadSub: 'fetch the newest version — your text is kept',
  language: 'language',
  langAuto: 'auto ({name})',
};

// casual "du", short words: the buttons and the status line are small
const de: Translation<typeof en> = {
  modeAria: 'nächster Modus',
  modeTitle: 'tippen für den nächsten Modus',
  soundToggle: 'Ton an/aus',
  placeholder: "tipp irgendwas.\nhau in die tasten.\nlass den hund drüberlaufen.\n\nfehler gibt's hier nicht.",
  extraKeys: 'Extratasten',
  run: 'LOS',
  stop: 'STOPP',
  mash: 'PFOTE',
  mashTitle: 'lass eine Pfote tippen',
  clear: 'WEG',
  undo: 'ZURÜCK',
  save: 'SICHERN',
  load: 'LADEN',
  edit: 'CODE',
  restart: 'neu starten',
  idleHint: 'links tippen — Änderungen sind live',
  programs: '// PROGRAMME',
  built: 'gebaut {time}',
  glyphs: 'ZEICHEN',
  saved: 'GESICHERT · PLATZ {n}',
  storageBlocked: "SPEICHER GESPERRT — KOPIER'S LIEBER",
  loaded: 'GELADEN',
  demos: 'DEMOS',
  savedHere: 'AUF DEINEM GERÄT',
  nothingSaved: 'noch nix da. drück 💾 SICHERN.',
  mode: 'MODUS',
  switchHint: 'Modus — oder tipp oben aufs Symbol',
  share: 'TEILEN',
  copy: '📋 Programm kopieren',
  copySub: "füg's überall ein — jeder Text ist ein Programm",
  copied: 'KOPIERT',
  copyBlocked: 'KOPIEREN GESPERRT',
  reload: '⟳ App neu laden',
  reloadSub: 'holt die neueste Version — dein Text bleibt',
  language: 'Sprache',
  langAuto: 'automatisch ({name})',
};

export type Msg = KeysOf<typeof en, string>;
export const { t } = defineMessages(en, de);
