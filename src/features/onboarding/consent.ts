/**
 * Consent recording (M9, docs/09 §1, migration 0002).
 *
 * The D1 disclosure is the notice; "Continue" is the agreement. Drivers have no
 * UPDATE policy on `profiles`, so the timestamp lands through the SECURITY
 * DEFINER RPC `record_consent(p_version)` — the only write path a non-admin
 * has to those two columns, and only on their own row.
 *
 * The version is a build-time constant recorded with each agreement. Nothing
 * re-prompts yet when it changes: the launch gate does not compare versions and
 * `start_trip` only requires a non-null `consent_version` (0006). Until such a
 * check exists, a bump reaches only drivers who have not agreed before.
 */
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

/**
 * The privacy-policy version the D1 notice stands for: equal to the
 * **Version:** line in docs/release/PRIVACY_POLICY.md (checked by
 * test/config/release-docs.test.mjs). Change both when the policy or the
 * disclosure copy changes materially.
 */
export const CONSENT_VERSION = "2026-10-01";

export type ConsentResult =
  | { ok: true }
  | {
      ok: false;
      kind: "not_configured" | "not_signed_in" | "outdated" | "rpc" | "network";
      message: string;
    };

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
