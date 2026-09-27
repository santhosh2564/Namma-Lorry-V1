/**
 * Auth store (M5).
 *
 * Zustand holds the small pieces of client state the gate and the two auth
 * screens need: who is signed in, which number an OTP was requested for, when
 * a resend is allowed, and the stub "a trip is recording" flag. Everything
 * that comes from the server (the profile) is a TanStack Query instead, so
 * there is exactly one owner for each fact.
 */
import { create } from "zustand";

import type { SessionStatus } from "@/features/auth/routing";

/** Seconds a driver has to wait before asking for another SMS (doc 12, S3). */
export const RESEND_COOLDOWN_SECONDS = 30;

/**
 * Supabase invalidates an SMS OTP after a few wrong guesses; the app mirrors
 * that so the counter in the UI matches what the server will accept.
 */
export const MAX_OTP_ATTEMPTS = 3;

export type AuthState = {
  status: SessionStatus;
  /** `auth.uid` of the current session, or null. */
  userId: string | null;
  /** E.164 of the number the current OTP was sent to, or null. */
  pendingPhone: string | null;
  /** Epoch ms when the next SMS may be requested, or null. */
  resendAvailableAt: number | null;
  /** Wrong codes left before the driver must request a new one. */
  attemptsLeft: number;
  /** Trip being recorded on this phone (stub until M8). */
  activeTripId: string | null;
  /** False until `readLocalTrackingState` has answered. */
  trackingChecked: boolean;

  setSession: (status: SessionStatus, userId: string | null) => void;
  setActiveTrip: (tripId: string | null) => void;
  setTrackingChecked: (checked: boolean) => void;
  /** Called right after a successful `signInWithOtp`. */
  startOtpChallenge: (phone: string, now: number) => void;
  /** Called after a resend: the counter restarts. */
  restartResendCooldown: (now: number) => void;
  /** Drops the cooldown, e.g. once the server says the code has expired. */
  allowResendNow: () => void;
  registerFailedAttempt: () => void;
  clearOtpChallenge: () => void;
};

export const useAuthStore = create<AuthState>()((set) => ({
  status: "initialising",
  userId: null,
  pendingPhone: null,
  resendAvailableAt: null,
  attemptsLeft: MAX_OTP_ATTEMPTS,
  activeTripId: null,
  trackingChecked: false,

  setSession: (status, userId) => set({ status, userId }),

  setActiveTrip: (tripId) => set({ activeTripId: tripId }),

  setTrackingChecked: (checked) => set({ trackingChecked: checked }),

  startOtpChallenge: (phone, now) =>
    set({
      pendingPhone: phone,
      resendAvailableAt: now + RESEND_COOLDOWN_SECONDS * 1000,
      attemptsLeft: MAX_OTP_ATTEMPTS,
    }),

  restartResendCooldown: (now) =>
    set({
      resendAvailableAt: now + RESEND_COOLDOWN_SECONDS * 1000,
      attemptsLeft: MAX_OTP_ATTEMPTS,
    }),

  allowResendNow: () => set({ resendAvailableAt: 0, attemptsLeft: MAX_OTP_ATTEMPTS }),

  registerFailedAttempt: () =>
    set((state) => ({ attemptsLeft: Math.max(0, state.attemptsLeft - 1) })),

  clearOtpChallenge: () =>
    set({ pendingPhone: null, resendAvailableAt: null, attemptsLeft: MAX_OTP_ATTEMPTS }),
}));

/** Resets every OTP field — used on sign-out and after a successful verify. */
export function resetOtpChallenge(): void {
  useAuthStore.getState().clearOtpChallenge();
}

/**
 * The clock the OTP cooldown is measured against. The screens pass a timestamp
 * in rather than reading one inside the store, so every deadline comes from
 * this one call.
 */
export function nowMs(): number {
  return Date.now();
}
