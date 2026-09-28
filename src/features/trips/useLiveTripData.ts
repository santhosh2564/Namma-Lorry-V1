/**
 * Live local trip data for D5 (M10, docs/12 D5).
 *
 * The Active Trip screen draws the route and the sync row from the **local
 * queue**, never from the server: the phone is often out of signal exactly when
 * the driver is looking at this screen, and a map that empties itself whenever
 * the network drops would be worse than useless (CLAUDE.md hard rule 5).
 *
 * Reads are polled rather than pushed, because the writer is the background
 * location task in another part of the app — a 5 s refresh is far cheaper than
 * wiring an inter-process event and keeps the screen honest about the queue.
 */
import { useQuery } from "@tanstack/react-query";

import { lastUploadedAt, type LivePoint } from "@/features/trips/liveState";
import { getTrackingStore } from "@/tracking/db";

/** Newest-first cap on the drawn route; far beyond any Phase 1 trip. */
export const ROUTE_POINT_LIMIT = 2_000;

/** How often D5 re-reads the queue while it is open. */
export const LIVE_POLL_MS = 5_000;

export type LiveTripData = {
  /** The recorded trace, oldest first — the D5 route line. */
  points: LivePoint[];
  /** Points saved locally that the server has not acknowledged yet. */
  pendingPoints: number;
  totalPoints: number;
  /** Device time the trip started (local state, so it survives being offline). */
  startedAt: string | null;
  /** Recorded time of the newest point that reached the server, or null. */
  syncedAt: string | null;
  /**
   * Epoch ms when this read happened.
   *
   * D5 needs a clock for elapsed time and the two-minute staleness rule, and a
   * component must not read one while rendering. Stamping the read in the query
   * function gives the screen a fresh "now" on every poll tick, from the layer
   * that is allowed to ask the OS what time it is.
   */
  readAt: number;
};

export const EMPTY_LIVE_DATA: LiveTripData = {
  points: [],
  pendingPoints: 0,
  totalPoints: 0,
  startedAt: null,
  syncedAt: null,
  readAt: 0,
};

/** Read the queue for `tripId`. Never throws — the screen falls back to empty. */
export async function readLiveTripData(tripId: string): Promise<LiveTripData> {
  try {
    const store = await getTrackingStore();
    const [points, counts, state] = await Promise.all([
      store.routePoints(tripId, ROUTE_POINT_LIMIT),
      store.countPoints(tripId),
      store.readState(),
    ]);
    return {
      points,
      pendingPoints: counts.pending,
      totalPoints: counts.total,
      startedAt: state.tripId === tripId ? state.startedAt : null,
      syncedAt: lastUploadedAt(points),
      readAt: Date.now(),
    };
  } catch {
    return EMPTY_LIVE_DATA;
  }
}

/** Polling subscription to the local queue while the screen is mounted. */
export function useLiveTripData(tripId: string | null, pollMs: number = LIVE_POLL_MS) {
  return useQuery({
    queryKey: ["driver", "trip", tripId, "local"],
    enabled: tripId !== null,
    queryFn: () => readLiveTripData(tripId ?? ""),
    refetchInterval: pollMs,
    // Local reads are cheap and always fresh; caching them would only show the
    // driver a route the phone has already moved past.
    staleTime: 0,
  });
}
