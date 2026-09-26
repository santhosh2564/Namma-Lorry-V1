/**
 * i18n bootstrap (M1). English strings only for now; ta/kn/hi land in M12a
 * with TODO-prefixed values (CLAUDE.md rule 10).
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

export const en = {
  common: {
    appName: 'Namma Lorry',
    loading: 'Loading…',
    retry: 'Retry',
    offline: 'You are offline',
    cancel: 'Cancel',
    save: 'Save',
  },
  placeholder: {
    title: 'Coming in a later milestone',
    body: 'This screen is scaffolded for navigation only.',
  },
} as const;

export const resources = {
  en: { translation: en },
} as const;

if (!i18n.isInitialized) {
  // eslint-disable-next-line import/no-named-as-default-member -- the default instance is the intended target
  i18n.use(initReactI18next).init({
    resources,
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

export default i18n;
