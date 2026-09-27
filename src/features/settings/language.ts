// App language, persisted per user (M12a, docs/13 P13).
// - On this phone: SecureStore (native) / localStorage (web), so S1–S3 show the last language
//   before anyone signs in.
// - Per user: profiles.preferred_language via the set_preferred_language RPC (0005). The server
//   value wins when a profile loads, unless the language was changed while signed out
//   ("pending"), in which case that choice is pushed to the profile.
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { applyLanguage, isLanguage, type Language } from '@/i18n';
import { supabase } from '@/lib/supabase';

const KEY = 'nl.language';
const PENDING = 'nl.language_pending';

export interface LocalLanguage {
  language: Language | null;
  pending: boolean;
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null; // storage blocked (private mode, sandboxed iframe)
    }
  }
  return SecureStore.getItemAsync(key).catch(() => null);
}

async function setItem(key: string, value: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (value === null) globalThis.localStorage?.removeItem(key);
      else globalThis.localStorage?.setItem(key, value);
    } catch {
      // ignore: the choice still applies for this session
    }
    return;
  }
  await (value === null ? SecureStore.deleteItemAsync(key) : SecureStore.setItemAsync(key, value)).catch(
    () => undefined,
  );
}

export async function readLocalLanguage(): Promise<LocalLanguage> {
  const [language, pending] = await Promise.all([getItem(KEY), getItem(PENDING)]);
  return { language: isLanguage(language) ? language : null, pending: pending === '1' };
}

/** App start: show the language last used on this phone. */
export async function restoreLanguage(): Promise<void> {
  const { language } = await readLocalLanguage();
  if (language) applyLanguage(language);
}

export async function saveProfileLanguage(language: Language): Promise<void> {
  const { error } = await supabase.rpc('set_preferred_language', { p_language: language });
  if (error) throw error;
}

/**
 * The driver picked a language (S2 or D8). Applies it now and remembers it on this phone;
 * when signed in it is also saved on the profile. Returns false if that save failed: the
 * choice is then kept as pending and retried on the next profile load.
 */
export async function chooseLanguage(language: Language, signedIn: boolean): Promise<boolean> {
  applyLanguage(language);
  await setItem(KEY, language);
  if (!signedIn) {
    await setItem(PENDING, '1');
    return true;
  }
  try {
    await saveProfileLanguage(language);
    await setItem(PENDING, null);
    return true;
  } catch {
    await setItem(PENDING, '1');
    return false;
  }
}

/** A profile loaded: its language wins, unless a choice made on this phone is still pending. */
export async function syncProfileLanguage(profileLanguage: string | null | undefined): Promise<void> {
  const local = await readLocalLanguage();
  if (local.pending && local.language) {
    applyLanguage(local.language);
    try {
      if (local.language !== profileLanguage) await saveProfileLanguage(local.language);
      await setItem(PENDING, null);
    } catch {
      // keep pending; retried on the next profile load
    }
    return;
  }
  if (isLanguage(profileLanguage)) {
    applyLanguage(profileLanguage);
    await setItem(KEY, profileLanguage);
  }
}
