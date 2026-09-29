/**
 * i18n (CLAUDE.md rule 10). en.json is the source of truth; ta/kn/hi.json carry the
 * same keys (kept in step by `npm run i18n:sync`). Values still marked "TODO: …" are
 * dropped here, so i18next falls back to English until a translator finishes them.
 * Language choice: src/i18n/language.ts (device cache + profiles.preferred_language).
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './en.json';
import hi from './hi.json';
import kn from './kn.json';
import ta from './ta.json';

export const SUPPORTED_LANGUAGES = ['en', 'ta', 'kn', 'hi'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const isAppLanguage = (value: unknown): value is AppLanguage =>
  typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);

type Tree = { [key: string]: string | Tree };

/** Removes untranslated ("TODO…") leaves so the English fallback is used instead. */
export function withoutTodos(tree: Tree): Tree {
  const out: Tree = {};
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === 'string') {
      if (!value.startsWith('TODO')) out[key] = value;
    } else {
      out[key] = withoutTodos(value);
    }
  }
  return out;
}

export const resources = {
  en: { translation: en },
  ta: { translation: withoutTodos(ta) },
  kn: { translation: withoutTodos(kn) },
  hi: { translation: withoutTodos(hi) },
};

/** BCP-47 locale for dates and numbers (Indian formats). */
export const localeFor = (language: string) => `${isAppLanguage(language) ? language : 'en'}-IN`;

if (!i18n.isInitialized) {
  // eslint-disable-next-line import/no-named-as-default-member -- the default instance is the intended target
  i18n.use(initReactI18next).init({
    resources,
    lng: 'en',
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES,
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

export default i18n;
