/**
 * C1 Live Dashboard data (M11, docs/12 C1, docs/06 §2).
 *
 * The board reads one table — `trip_live`, one row per trip on the road — and
 * joins the names it shows. `trip_live` is already in `supabase_realtime`
 * (migration 0001), so the map follows the fleet without polling.
 *
 * Three mechanisms cover the same read, because each can fail on its own:
 * - **Realtime** — a `postgres_changes` subscription on `trip_live` (INSERT for
 *   a new trip, UPDATE for every point, DELETE when a trip ends). Every event
 *   invalidates the query rather than patching a row in place: the row is a
 *   join of four tables, and refetching is the only way to be sure the name
 *   next to the position is the current one.
 * - **Resubscribe** — on `SUBSCRIBED` the query is refetched. A socket that
 *   dropped and came back has missed everything that happened while it was
 *   gone, and a board that silently shows 23-minute-old trucks as "live" is the
 *   failure this screen exists to prevent.
 * - **Polling** — every {@link LIVE_REFRESH_MS} regardless, because a console
 *   left open on a flaky office link should not need a reload to notice a trip
 *   that ended.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { kpiStrip, type LiveKpi, type LiveTrip } from "@/features/console/liveState";
import type { Tables } from "@/lib/database.types";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type LiveRow = Tables<"trip_live">;
type TripRow = Tables<"trips">;
type LoadRow = Tables<"loads">;
type ProfileRow = Tables<"profiles">;
type VehicleRow = Tables<"vehicles">;

export const LIVE_TRIPS_QUERY_KEY = ["console", "live"] as const;

/** Belt-and-braces refresh when realtime is not delivering. */
export const LIVE_REFRESH_MS = 30_000;

function throwUnlessOk(error: { message: string } | null): void {
  if (error) {
    throw new Error(error.message);
  }
}

/**
 * C1 — every trip currently on the road, with the names the list shows.
 *
 * The join is done here in TypeScript rather than as a nested PostgREST select,
 * for the same reason as C8/C5: the generated types carry each table's own
 * foreign keys but not the reverse relationships, so a nested select would not
 * type-check even though the database would happily run it.
 */
export function useLiveTrips() {
  return useQuery({
    queryKey: LIVE_TRIPS_QUERY_KEY,
    enabled: isSupabaseConfigured,
    queryFn: async (): Promise<{ trips: LiveTrip[]; readAt: number }> => {
      const live = await supabase.from("trip_live").select("*");
      throwUnlessOk(live.error);

      const rows = (live.data ?? []) as LiveRow[];

      // No trucks on the road is the normal case at 07:00, not an error, and
      // it must not turn into three pointless joins against empty id lists.
      if (rows.length === 0) {
        return { trips: [], readAt: Date.now() };
      }

      const tripIds = rows.map((row) => row.trip_id);
      const [trips, loads, drivers, vehicles] = await Promise.all([
        supabase.from("trips").select("*").in("id", tripIds).eq("status", "in_progress"),
        supabase
          .from("loads")
          .select(
            "id, load_code, pickup_address, drop_address, pickup_lat, pickup_lng, drop_lat, drop_lng, drop_radius_m",
          ),
        supabase.from("profiles").select("id, full_name"),
        supabase.from("vehicles").select("id, registration_no"),
      ]);

      throwUnlessOk(trips.error);
      throwUnlessOk(loads.error);
      throwUnlessOk(drivers.error);
      throwUnlessOk(vehicles.error);

      const tripById = new Map<string, TripRow>(
        (trips.data as TripRow[]).map((trip) => [trip.id, trip]),
      );
      const loadByTrip = new Map<string, LoadRow>();
      for (const trip of trips.data as TripRow[]) {
        const load = (loads.data as LoadRow[]).find((row) => row.id === trip.load_id);
        if (load) {
          loadByTrip.set(trip.id, load);
        }
      }
      const driverById = new Map(
        (drivers.data as ProfileRow[]).map((row) => [row.id, row.full_name]),
      );
      const vehicleById = new Map(
        (vehicles.data as VehicleRow[]).map((row) => [row.id, row.registration_no]),
      );

      // A `trip_live` row whose trip is no longer in progress is a delete that
      // has not landed yet; it is not a truck to put on a map.
      const liveTrips: LiveTrip[] = [];
      for (const row of rows) {
        const trip = tripById.get(row.trip_id);
        const load = loadByTrip.get(row.trip_id);
        if (trip === undefined || load === undefined) {
          continue;
        }
        liveTrips.push({
          tripId: row.trip_id,
          driverId: row.driver_id,
          driverName: driverById.get(row.driver_id) ?? "—",
          vehicleNo: vehicleById.get(trip.vehicle_id) ?? "—",
          loadCode: load.load_code,
          pickupAddress: load.pickup_address,
          dropAddress: load.drop_address,
          position: { lat: row.lat, lng: row.lng },
          heading: row.heading,
          speedMps: row.speed_mps,
          accuracyM: row.accuracy_m,
          recordedAt: row.recorded_at,
          pickup: { lat: load.pickup_lat, lng: load.pickup_lng },
          drop: { lat: load.drop_lat, lng: load.drop_lng },
          dropRadiusM: load.drop_radius_m,
        });
      }

      return { trips: liveTrips, readAt: Date.now() };
    },
    refetchInterval: LIVE_REFRESH_MS,
    // The fleet moves constantly; a cached second-old map is a wrong map.
    staleTime: 5_000,
  });
}

/**
 * The `trip_live` subscription (docs/06 §3).
 *
 * Kept in its own hook so the screen can mount it once while the query hook
 * stays a plain data source, and so a resubscribe-on-reconnect rule is stated
 * in exactly one place.
 */
export function useLiveTripsRealtime(enabled = true) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !isSupabaseConfigured) {
      return;
    }

    const channel = supabase
      .channel("live-trips")
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_live" }, () => {
        void queryClient.invalidateQueries({ queryKey: LIVE_TRIPS_QUERY_KEY });
      })
      .subscribe((status) => {
        // Everything that happened while the socket was down is missing from
        // the local view, so a reconnect re-reads the table outright.
        if (status === "SUBSCRIBED") {
          void queryClient.invalidateQueries({ queryKey: LIVE_TRIPS_QUERY_KEY });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, queryClient]);
}

const ASSIGNED_TODAY_KEY = ["console", "live", "assigned-today"] as const;
const NEEDS_REVIEW_KEY = ["console", "live", "needs-review"] as const;

/** Local-day bounds, so "assigned today" means the dispatcher's today. */
export function localDayBounds(nowMs: number): { from: string; to: string } {
  const from = new Date(nowMs);
  from.setHours(0, 0, 0, 0);
  const to = new Date(nowMs);
  to.setHours(23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

/**
 * C1 — the KPI strip.
 *
 * "live" and "stale" come from the rows already on screen so the strip cannot
 * disagree with the list; the other two are counted in Postgres because neither
 * is derivable from `trip_live`. `nowMs` is passed in rather than read here, so
 * the same rows always produce the same numbers in a test.
 */
export function useLiveKpis(nowMs: number): {
  kpis: LiveKpi[];
  isPending: boolean;
  isError: boolean;
} {
  const live = useLiveTrips();
  const bounds = localDayBounds(nowMs);

  const assigned = useQuery({
    queryKey: [...ASSIGNED_TODAY_KEY, bounds.from],
    enabled: isSupabaseConfigured,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("trips")
        .select("id", { count: "exact", head: true })
        .eq("status", "assigned")
        .gte("created_at", bounds.from)
        .lte("created_at", bounds.to);

      throwUnlessOk(error);
      return count ?? 0;
    },
    staleTime: 60_000,
  });

  const needsReview = useQuery({
    queryKey: NEEDS_REVIEW_KEY,
    enabled: isSupabaseConfigured,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("trips")
        .select("id", { count: "exact", head: true })
        .eq("status", "needs_review");

      throwUnlessOk(error);
      return count ?? 0;
    },
    staleTime: 60_000,
  });

  const kpis = kpiStrip({
    trips: live.data?.trips ?? [],
    nowMs,
    assignedToday: assigned.data ?? 0,
    needsReview: needsReview.data ?? 0,
  });

  return {
    kpis,
    isPending: live.isPending || assigned.isPending || needsReview.isPending,
    isError: live.isError || assigned.isError || needsReview.isError,
  };
}
