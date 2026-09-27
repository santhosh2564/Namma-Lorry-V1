import { useEffect } from 'react';

import { useProfile } from '@/features/auth/useProfile';

import { syncProfileLanguage } from './language';

/** Applies the signed-in user's saved language whenever their profile loads (root layout). */
export function LanguageSync() {
  const language = useProfile().data?.preferred_language;
  useEffect(() => {
    if (language !== undefined) void syncProfileLanguage(language);
  }, [language]);
  return null;
}
