import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./en.json";
import hi from "./hi.json";
import kn from "./kn.json";
import ta from "./ta.json";

/**
 * i18n bootstrap (M1 seed).
 *
 * CLAUDE.md hard rule 10: UI text lives in src/i18n/, English first.
 * ta/kn/hi are stubs whose untranslated values are prefixed with "TODO"
 * (M12a fills them in; P1-4 in the PRD).
 */
export const supportedLanguages = ["en", "ta", "kn", "hi"] as const;
export type Language = (typeof supportedLanguages)[number];

export const defaultLanguage: Language = "en";

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      ta: { translation: ta },
      kn: { translation: kn },
      hi: { translation: hi },
    },
    lng: defaultLanguage,
    fallbackLng: defaultLanguage,
    interpolation: {
      escapeValue: false, // React already escapes
    },
    returnNull: false,
  });
}

export default i18n;
