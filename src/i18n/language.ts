/**
 * Language persistence. The server copy (profiles.preferred_language, written only via
 * the set_preferred_language RPC, migration 0003) follows the user across devices; the
 * device copy (AsyncStorage) makes the first frame of a cold start use the right language
 * before the profile has loaded.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/lib/supabase';

import i18n, { isAppLanguage, type AppLanguage } from './index';

const STORAGE_KEY = 'nl.language';

/** Call once at startup; applies the device-cached language if there is one. */
export async function restoreLanguage(): Promise<void> {
  try {
    const cached = await AsyncStorage.getItem(STORAGE_KEY);
    if (isAppLanguage(cached) && cached !== i18n.language) await i18n.changeLanguage(cached);
  } catch {
    // Storage unavailable (e.g. web private mode): stay on the default language.
  }
}

/** Applies the language stored on the signed-in user's profile (server wins over device). */
export async function applyProfileLanguage(language: unknown): Promise<void> {
  if (!isAppLanguage(language) || language === i18n.language) return;
  await i18n.changeLanguage(language);
  await AsyncStorage.setItem(STORAGE_KEY, language).catch(() => undefined);
}

/**
 * User picked a language: switch now, cache on the device, and save to the profile.
 * Throws the RPC error if the server save fails (the UI stays switched either way).
 */
export async function setAppLanguage(language: AppLanguage): Promise<void> {
  await i18n.changeLanguage(language);
  await AsyncStorage.setItem(STORAGE_KEY, language).catch(() => undefined);
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  const { error } = await supabase.rpc('set_preferred_language', { p_language: language });
  if (error) throw error;
}
