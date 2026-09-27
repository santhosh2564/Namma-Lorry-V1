/**
 * Supabase auth calls (M5).
 *
 * Every function throws an `AuthError` carrying one of the codes in
 * `errors.ts`, so the screens never have to look at a Supabase message. The
 * OTP request uses `shouldCreateUser: false` (ND-12): an unknown number is
 * refused, which is the P0-1 "Contact Namma Lorry to register" state, and the
 * only way to add a driver becomes the admin-only Edge Function in M6.
 */
import { AuthError, mapAuthError } from "@/features/auth/errors";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

function requireConfigured(): void {
  if (!isSupabaseConfigured) {
    throw new AuthError("not_configured");
  }
}

/** Ask Supabase to text a six-digit code to `phone` (E.164). */
export async function sendOtp(phone: string): Promise<void> {
  requireConfigured();

  const { error } = await supabase.auth.signInWithOtp({
    phone,
    options: { shouldCreateUser: false },
  });

  if (error) {
    throw new AuthError(mapAuthError(error));
  }
}

/**
 * Exchange the six digits for a session. Supabase writes the session through
 * the configured storage adapter (secure store on native), which fires the
 * auth listener and updates the store — no manual bookkeeping here.
 */
export async function verifyOtp(phone: string, token: string): Promise<void> {
  requireConfigured();

  const { error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });

  if (error) {
    throw new AuthError(mapAuthError(error));
  }
}

export async function signOut(): Promise<void> {
  requireConfigured();

  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new AuthError(mapAuthError(error));
  }
}
