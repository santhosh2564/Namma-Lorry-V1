/**
 * Auth bootstrap (M5).
 *
 * Mounted once from the root layout. It does the two things every route needs
 * before it can render anything honest: resolve the persisted Supabase session
 * and read the local tracking state that S1 checks first (docs/04 §2).
 *
 * Both are async, so the store starts at `initialising` and the gate stays on
 * the splash until they land — better a brand screen for 200 ms than a flash of
 * the wrong destination.
 */
import { useEffect } from "react";

import { useAuthStore } from "@/features/auth/store";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { readLocalTrackingState } from "@/tracking/localState";

export function useAuthBootstrap(): void {
  useEffect(() => {
    // Local tracking state first: an unfinished trip outranks the session, so
    // it must be known before the gate can decide (docs/04 §2).
    let cancelled = false;

    void readLocalTrackingState().then((state) => {
      if (cancelled) {
        return;
      }
      useAuthStore.getState().setActiveTrip(state.activeTripId);
      useAuthStore.getState().setTrackingChecked(true);
    });

    const { setSession } = useAuthStore.getState();

    if (!isSupabaseConfigured) {
      // Nothing can be signed in without a backend, so the gate goes straight
      // to S2 and the first tap explains that sign-in is unavailable.
      setSession("signed_out", null);
      return () => {
        cancelled = true;
      };
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) {
        return;
      }
      setSession(data.session ? "signed_in" : "signed_out", data.session?.user.id ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session ? "signed_in" : "signed_out", session?.user.id ?? null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);
}
