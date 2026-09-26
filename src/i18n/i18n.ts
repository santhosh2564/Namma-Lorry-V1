// i18next instance for Namma Lorry (CLAUDE.md rule 10, docs/13 P13).
// en.json is the source of truth; ta/kn/hi have the same keys. A value that still starts with
// "TODO" is untranslated: it is dropped at load time, so i18next falls back to English for it.
import { createInstance } from 'i18next';

import en from './en.json';
import hi from './hi.json';
import kn from './kn.json';
import ta from './ta.json';

export const LANGUAGES = ['en', 'ta', 'kn', 'hi'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Each language's own name. Not translated: a driver must recognise their language in any UI. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  ta: 'தமிழ் (Tamil)',
  kn: 'ಕನ್ನಡ (Kannada)',
  hi: 'हिन्दी (Hindi)',
};

export const TODO_PREFIX = 'TODO';

type Value = string | Value[] | { [k: string]: Value };
export type Tree = { [k: string]: Value };

const isTodo = (v: Value) => typeof v === 'string' && v.startsWith(TODO_PREFIX);

function strip(v: Value): Value | undefined {
  if (typeof v === 'string') return isTodo(v) ? undefined : v;
  // A list is used whole (month names, steps, disclosure rows): any untranslated item → English list.
  if (Array.isArray(v)) return translatedShare({ v }) === 1 ? v : undefined;
  const out: Tree = {};
  for (const [k, x] of Object.entries(v)) {
    const r = strip(x);
    if (r !== undefined) out[k] = r;
  }
  return out;
}

/** Removes untranslated ("TODO …") values so the English fallback shows instead. */
export function stripTodo(tree: Tree): Tree {
  return strip(tree) as Tree;
}

/** Share of leaf strings that are translated (1 for English). Drives the "partly English" hint. */
export function translatedShare(tree: Tree): number {
  let total = 0;
  let done = 0;
  const walk = (v: Value) => {
    if (typeof v === 'string') {
      total += 1;
      if (!isTodo(v)) done += 1;
    } else (Array.isArray(v) ? v : Object.values(v)).forEach(walk);
  };
  walk(tree);
  return total ? done / total : 1;
}

export const catalogs: Record<Language, Tree> = { en, ta, kn, hi };

export const i18n = createInstance();
void i18n.init({
  lng: 'en',
  fallbackLng: 'en',
  supportedLngs: [...LANGUAGES],
  initAsync: false, // resources are bundled: init synchronously so the first render is translated
  resources: Object.fromEntries(
    LANGUAGES.map((l) => [l, { translation: l === 'en' ? en : stripTodo(catalogs[l]) }]),
  ),
  interpolation: { escapeValue: false }, // React escapes; no HTML is built from strings
  returnNull: false,
});

export function isLanguage(v: unknown): v is Language {
  return typeof v === 'string' && (LANGUAGES as readonly string[]).includes(v);
}

export function getLanguage(): Language {
  return isLanguage(i18n.language) ? i18n.language : 'en';
}

/** Translate `key` (dot path into en.json) in the current language. */
export function tr(key: string, vars?: Record<string, string | number>): string {
  return i18n.t(key, vars) as string;
}

const listeners = new Set<() => void>();

export function subscribeLanguage(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export function applyLanguage(lang: Language): void {
  if (lang === getLanguage()) return;
  void i18n.changeLanguage(lang);
  listeners.forEach((fn) => fn());
}
