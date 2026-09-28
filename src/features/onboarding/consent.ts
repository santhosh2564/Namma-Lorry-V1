/**
 * Consent recording (M9, docs/09 §1, migration 0002).
 *
 * The D1 disclosure is the notice; "Continue" is the agreement. Drivers have no
 * UPDATE policy on `profiles`, so the timestamp lands through the SECURITY
 * DEFINER RPC `record_consent(p_version)` — the only write path a non-admin
 * has to those two columns, and only on their own row.
 *
 * The version is a build-time constant: bumping it re-prompts the disclosure
 * on the next consent check (the stored version will no longer match), which
 * is how a changed privacy policy reaches already-onboarded drivers.
 */
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

/**
 * Bump when the disclosure copy or the privacy policy changes materially.
 * Kept next to the D1 copy so the two cannot drift apart silently.
 */
export const CONSENT_VERSION = "2026-09-27.1";

export type ConsentResult =
  | { ok: true }
  | { ok: false; kind: "not_configured" | "not_signed_in" | "rpc" | "network"; message: string };

/**
 * Record the driver's agreement. Called from D1's Continue; the screen blocks
 * the flow when this fails, because an unrecorded consent must not let a
 * driver sail into tracking (docs/09 §1: notice + consent before collection).
 */
export async function recordConsent(): Promise<ConsentResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, kind: "not_configured", message: "Supabase is not configured" };
  }
  const { error } = await supabase.rpc("record_consent", { p_version: CONSENT_VERSION });
  if (error === null) {
    return { ok: true };
  }
  // The RPC refuses an anonymous caller (auth.uid() is null there), which is
  // how a dropped session shows up on this screen.
  const message = error.message.toLowerCase();
  if (
    message.includes("permission") ||
    message.includes("forbidden") ||
    message.includes("42501")
  ) {
    return { ok: false, kind: "not_signed_in", message: error.message };
  }
  const networkPhrases = ["network request failed", "failed to fetch", "fetch failed", "timeout"];
  if (networkPhrases.some((phrase) => message.includes(phrase))) {
    return { ok: false, kind: "network", message: error.message };
  }
  return { ok: false, kind: "rpc", message: error.message };
}
