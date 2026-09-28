/**
 * D6 data (M10, docs/12 D6, docs/06 §2–§3).
 *
 * The summary is the one driver screen that follows server state: `verify_trip`
 * runs in Postgres when the last point arrives (or six hours later), so the trip
 * row can change under the driver while the screen is open.
 *
 * Two mechanisms cover that, because either can fail on its own:
 * - **Realtime** — a `postgres_changes` subscription filtered to this trip's row
 *   refetches the moment the status changes. It is re-fetched again on
 *   `SUBSCRIBED` so a reconnect cannot leave a stale verdict on screen
 *   (docs/06 §3).
 * - **Polling** — every 10 s while the trip is still `completed`, i.e. only
 *   while there is something to wait for. Websockets are routinely blocked on
 *   Indian mobile networks, and "Checking your trip…" that never resolves is the
 *   worst possible outcome for this screen.
 *
 * Realtime needs `trips` in the `supabase_realtime` publication, which migration
 * `0003` adds; without it the subscription silently delivers nothing and the
 * poll is what keeps the screen honest.
 */
import type { Query } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";

import { useAuthStore } from "@/features/auth/store";
import { useDriverStats, useDriverTrip, type DriverTrip } from "@/features/trips/useDriverTrips";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

/** How often D6 re-reads the trip while it is waiting for a verdict. */
export const SUMMARY_POLL_MS = 10_000;

export function useTripSummary(tripId: string | null) {
  const userId = useAuthStore((state) => state.userId);

  const tripQuery = useDriverTrip(tripId, {
    // Poll only while there is something to wait for.
    refetchInterval: (query: Query<DriverTrip | null, Error>) =>
      query.state.data?.status === "completed" ? SUMMARY_POLL_MS : false,
  });
  const statsQuery = useDriverStats(userId);

  const refetch = tripQuery.refetch;
  const refetchStats = statsQuery.refetch;

  const onTripChange = useCallback(() => {
    void refetch();
    // A verification also moves `driver_stats`, so the totals are re-read with
    // the row rather than on their own schedule.
    void refetchStats();
  }, [refetch, refetchStats]);

  useEffect(() => {
    if (tripId === null || !isSupabaseConfigured) {
      return;
    }
    const channel = supabase
      .channel(`trip-summary-${tripId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trips", filter: `id=eq.${tripId}` },
        onTripChange,
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          onTripChange();
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tripId, onTripChange]);

  return { tripQuery, statsQuery };
}
