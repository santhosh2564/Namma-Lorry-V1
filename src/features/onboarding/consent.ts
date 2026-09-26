import { supabase } from '@/lib/supabase';

/**
 * Version of the D1 notice the driver agrees to (docs/09 §1). Bump it whenever the
 * disclosure text or the privacy policy changes: drivers on an older version see D1 again.
 */
export const CONSENT_VERSION = '2026-09-v1';

export function hasCurrentConsent(profile: { consent_version: string | null } | null | undefined): boolean {
  return profile?.consent_version === CONSENT_VERSION;
}

/** "I agree" → profiles.consent_version / consent_at via the record_consent RPC (0002). */
export async function recordConsent(): Promise<void> {
  const { error } = await supabase.rpc('record_consent', { p_version: CONSENT_VERSION });
  if (error) throw error;
}
