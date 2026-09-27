import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { supabase } from '@/lib/supabase';

export type AuthStatus = 'loading' | 'signed-in' | 'signed-out';

interface AuthState {
  status: AuthStatus;
  session: Session | null;
  /** E.164 number waiting for its OTP (S2 → S3). */
  pendingPhone: string | null;
  /** When the last OTP was sent (ms since epoch); drives the resend timer and expiry. */
  otpSentAt: number | null;
  setOtpSent: (phone: string, at?: number) => void;
  clearPending: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  session: null,
  pendingPhone: null,
  otpSentAt: null,
  setOtpSent: (phone, at = Date.now()) => set({ pendingPhone: phone, otpSentAt: at }),
  clearPending: () => set({ pendingPhone: null, otpSentAt: null }),
}));

let started = false;

/** Subscribe once to Supabase auth; INITIAL_SESSION resolves the loading state. */
export function startAuthListener(): () => void {
  if (started) return () => {};
  started = true;
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    useAuthStore.setState({ session, status: session ? 'signed-in' : 'signed-out' });
  });
  return () => {
    data.subscription.unsubscribe();
    started = false;
  };
}
