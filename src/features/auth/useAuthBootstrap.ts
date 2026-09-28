/**
 * Auth bootstrap (M5, extended in M8).
 *
 * Mounted once from the root layout. It does the things every route needs
 * before it can render anything honest: read the local tracking state that S1
 * checks first, resume an unfinished trip, and resolve the persisted Supabase
 * session (docs/04 §2).
 *
 * The order matters and so does what is awaited. The local read is **fast and
 * local**, so it happens first and the gate is never blocked on a network — a
 * driver on a bad connection must still reach the app in a second. Resume (which
 * restarts the location task, retries a pending end and flushes the queue) then
 * runs in the background; when it finishes, the tracking state is re-read, so a
 * trip that was `ENDED_PENDING_SYNC` and syncs at launch stops routing the
 * driver to the active-trip screen. The upload scheduler starts here too, so
 * queued points drain on every launch.
 *
 * The session read is async, so the store starts at `initialising` and the gate
 * stays on the splash until it lands — better a brand screen for 200 ms than a
 * flash of the wrong destination.
 */
import { useEffect } from "react";

import { useAuthStore } from "@/features/auth/store";
import { permissionsLost, readPermissionSnapshot } from "@/features/onboarding/permissions";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { readLocalTrackingState } from "@/tracking/localState";
import { resumeTrackingOnLaunch, startUploadScheduler } from "@/tracking/service";

export function useAuthBootstrap(): void {
  useEffect(() => {
    // Local tracking state first: an unfinished trip outranks the session, so
    // it must be known before the gate can decide (docs/04 §2).
    let cancelled = false;

    void (async () => {
      // 1. Fast, local, blocking: the gate can decide as soon as this lands.
      const initial = await readLocalTrackingState();
      if (cancelled) {
        return;
      }
      useAuthStore.getState().setActiveTrip(initial.activeTripId);
      useAuthStore.getState().setTrackingChecked(true);
      startUploadScheduler();

      // 1b. The permission read is also fast and local, and it feeds the gate:
      // a driver whose background location grant vanished routes back to D1
      // (docs/12 D1 re-check rule) instead of into an untrackable trip.
      const snapshot = await readPermissionSnapshot();
      if (cancelled) {
        return;
      }
      useAuthStore.getState().setPermissionsGranted(!permissionsLost(snapshot));

      // 2. Background: restart the task, retry a pending end, flush the queue.
      // A failure here must not strand the splash — the trip stays in storage
      // and the next launch retries.
      try {
        await resumeTrackingOnLaunch();
      } catch {
        return;
      }

      const settled = await readLocalTrackingState();
      if (!cancelled && settled.activeTripId !== initial.activeTripId) {
        useAuthStore.getState().setActiveTrip(settled.activeTripId);
      }
    })();

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
