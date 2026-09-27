/**
 * Auth form schemas (M5).
 *
 * Validation lives here so S2 and S3 share one definition and the tests can
 * exercise the rules without a renderer. The rules are deliberately strict:
 * an Indian mobile number is 10 digits starting 6-9, which is what the seed
 * data and every driver's phone in the pilot list look like.
 */
import { z } from "zod";

/** Country code the app signs in with. Fixed in the UI (doc 12, S2). */
export const COUNTRY_CODE = "+91";

/**
 * 10-digit national number, no country code. The input layer (`PhoneInput`)
 * strips everything that is not a digit before this runs, so the schema only
 * has to police the shape — which is exactly the check a pasted `+91 98765
 * 43210` must not be able to slip past.
 */
export const phoneSchema = z.string().regex(/^[6-9]\d{9}$/, "auth.invalidPhone");

/** Six digits, exactly what Supabase sends (doc 12, S3). */
export const otpSchema = z.string().regex(/^\d{6}$/, "auth.invalidCode");

export type PhoneInput = z.infer<typeof phoneSchema>;
export type OtpInput = z.infer<typeof otpSchema>;

/** `919000000011` -> `+919000000011`, the format Supabase auth expects. */
export function toE164(nationalNumber: string): string {
  return `${COUNTRY_CODE}${nationalNumber.replace(/\D/g, "")}`;
}

/** `9876543210` -> `+91 98765 43210`, for confirmation copy. */
export function formatPhone(nationalNumber: string): string {
  const digits = nationalNumber.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 5) {
    return `${COUNTRY_CODE} ${digits}`.trim();
  }
  return `${COUNTRY_CODE} ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

/**
 * `9876543210` -> `98xxx x4321` … kept deliberately vague: a screenshot of S3
 * should not leak the whole number (docs/09 §2).
 */
export function maskPhone(nationalNumber: string): string {
  const digits = nationalNumber.replace(/\D/g, "").slice(-10).padStart(10, "0");
  const head = digits.slice(0, 4);
  const tail = digits.slice(-4);
  return `${COUNTRY_CODE} ${head}xxx x${tail}`;
}

/** `24` -> `0:24`, the countdown format in the design. */
export function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}
