/**
 * Driver-side trip data (M9, docs/12 D3/D4).
 *
 * Mirrors the console's `useTrips` conventions but driver-scoped: RLS already
 * limits every row to `driver_id = auth.uid()` (the `trips_driver` policy), so
 * the query does not repeat the filter — it is defence in depth anyway.
 *
 * The D4 detail read joins load + vehicle in TypeScript for the same reason the
 * console lists do: the generated types have no reverse relationships, so a
 * nested select would not typecheck.
 */
import type { Query } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";

import type { HistoryRow } from "@/features/trips/historyState";
import type { Json, Tables } from "@/lib/database.types";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type TripRow = Tables<"trips">;
type LoadRow = Tables<"loads">;

/**
 * TanStack's `refetchInterval` shape for the driver-trip query, so a caller can
 * poll conditionally (D6 polls only while a trip is still being verified).
 */
export type RefetchInterval =
  | number
  | false
  | ((query: Query<DriverTrip | null, Error, DriverTrip | null>) => number | false | undefined);

export type DriverTrip = {
  id: string;
  loadId: string;
  loadCode: string;
  pickup: string;
  drop: string;
  material: string | null;
  plannedDistanceM: number | null;
  pickupLat: number;
  pickupLng: number;
  pickupRadiusM: number;
  dropLat: number;
  dropLng: number;
  dropRadiusM: number;
  vehicleNo: string;
  status: TripRow["status"];
  startedAt: string | null;
  /** D6: when the driver ended it. */
  endedAt: string | null;
  /** Points the phone said it had recorded when End was tapped. */
  expectedPoints: number | null;
  /** Official kilometres — set only by `verify_trip`, never by the client. */
  trackedDistanceM: number | null;
  /** docs/08 §3 reason codes, empty when the trip verified cleanly. */
  verificationReasons: string[];
  /** `verify_trip`'s measurements, used to explain the reasons (D6). */
  verificationMetrics: Json | null;
};

function throwUnlessOk(error: { message: string } | null): void {
  if (error) {
    throw new Error(error.message);
  }
}

/** Build `DriverTrip` from one trips row plus its load and vehicle rows. */
function toDriverTrip(trip: TripRow, load: Tables<"loads">, vehicleNo: string): DriverTrip {
  return {
    id: trip.id,
    loadId: trip.load_id,
    loadCode: load.load_code,
    pickup: load.pickup_address,
    drop: load.drop_address,
    material: load.material,
    plannedDistanceM: load.planned_distance_m,
    pickupLat: load.pickup_lat,
    pickupLng: load.pickup_lng,
    pickupRadiusM: load.pickup_radius_m,
    dropLat: load.drop_lat,
    dropLng: load.drop_lng,
    dropRadiusM: load.drop_radius_m,
    vehicleNo,
    status: trip.status,
    startedAt: trip.started_at,
    endedAt: trip.ended_at,
    expectedPoints: trip.expected_points,
    trackedDistanceM: trip.tracked_distance_m,
    verificationReasons: trip.verification_reasons,
    verificationMetrics: trip.verification_metrics,
  };
}

/**
 * D3 — the driver's open trips (assigned or in_progress), newest first.
 *
 * The active-trip pin comes from the local tracking state, so this query only
 * has to answer "what is assigned to me"; the two lists meet in the screen.
 */
export function useDriverTrips(userId: string | null) {
  return useQuery({
    queryKey: ["driver", "trips", userId],
    enabled: userId !== null && isSupabaseConfigured,
    queryFn: async (): Promise<DriverTrip[]> => {
      const { data: trips, error } = await supabase
        .from("trips")
        .select("*")
        .in("status", ["assigned", "in_progress"])
        .order("created_at", { ascending: false });
      throwUnlessOk(error);

      const rows = trips ?? [];
      if (rows.length === 0) {
        return [];
      }

      const [loads, vehicles] = await Promise.all([
        supabase
          .from("loads")
          .select("*")
          .in("id", [...new Set(rows.map((trip) => trip.load_id))]),
        supabase
          .from("vehicles")
          .select("id, registration_no")
          .in("id", [...new Set(rows.map((trip) => trip.vehicle_id))]),
      ]);
      throwUnlessOk(loads.error);
      throwUnlessOk(vehicles.error);

      const loadsById = new Map((loads.data ?? []).map((load) => [load.id, load]));
      const vehiclesById = new Map(
        (vehicles.data ?? []).map((vehicle) => [vehicle.id, vehicle.registration_no]),
      );

      return rows.flatMap((trip) => {
        const load = loadsById.get(trip.load_id);
        if (load === undefined) {
          // A trip without its load row cannot be displayed or started; skip
          // rather than render a card that would crash D4.
          return [];
        }
        return [toDriverTrip(trip, load, vehiclesById.get(trip.vehicle_id) ?? "—")];
      });
    },
    staleTime: 15_000,
  });
}

/**
 * D4 — one trip with everything the start flow needs.
 *
 * `options.refetchInterval` is how D6 adds its polling fallback while a trip is
 * still being verified: realtime is the fast path there, but a driver on a
 * network that silently drops websockets must not be stuck on "Checking your
 * trip…" forever.
 */
export function useDriverTrip(
  tripId: string | null,
  options: { refetchInterval?: RefetchInterval } = {},
) {
  return useQuery({
    queryKey: ["driver", "trip", tripId],
    enabled: tripId !== null && isSupabaseConfigured,
    refetchInterval: options.refetchInterval,
    queryFn: async (): Promise<DriverTrip | null> => {
      const { data: trip, error } = await supabase
        .from("trips")
        .select("*")
        .eq("id", tripId ?? "")
        .maybeSingle();
      throwUnlessOk(error);
      if (trip === null) {
        return null;
      }

      const [{ data: load, error: loadError }, { data: vehicle, error: vehicleError }] =
        await Promise.all([
          supabase.from("loads").select("*").eq("id", trip.load_id).maybeSingle(),
          supabase
            .from("vehicles")
            .select("id, registration_no")
            .eq("id", trip.vehicle_id)
            .maybeSingle(),
        ]);
      throwUnlessOk(loadError);
      throwUnlessOk(vehicleError);
      if (load === null) {
        return null;
      }

      return toDriverTrip(trip, load, vehicle?.registration_no ?? "—");
    },
    staleTime: 10_000,
  });
}

/**
 * D6 — the driver's verified experience totals.
 *
 * `driver_stats` is written only by `apply_verified_stats` when a trip verifies
 * (docs/08 §1), and RLS limits the read to the driver's own row. There is no
 * client-side arithmetic on these numbers anywhere: the app displays the
 * official total, it never derives it (CLAUDE.md hard rule 1).
 */
export function useDriverStats(userId: string | null) {
  return useQuery({
    queryKey: ["driver", "stats", userId],
    enabled: userId !== null && isSupabaseConfigured,
    queryFn: async (): Promise<{ verifiedTrips: number; verifiedKm: number } | null> => {
      const { data, error } = await supabase.from("driver_stats").select("*").maybeSingle();
      throwUnlessOk(error);
      if (data === null) {
        return null;
      }
      return {
        verifiedTrips: data.verified_trips,
        verifiedKm: Math.round(Number(data.verified_distance_m) / 1000),
      };
    },
    staleTime: 30_000,
  });
}

/** `driver_stats.last_verified_at` — D8's "Last trip" line. */
export function useDriverStatsDetail(userId: string | null) {
  return useQuery({
    queryKey: ["driver", "stats", userId],
    enabled: userId !== null && isSupabaseConfigured,
    queryFn: async () => {
      const { data, error } = await supabase.from("driver_stats").select("*").maybeSingle();
      throwUnlessOk(error);
      return data;
    },
    staleTime: 30_000,
  });
}

/**
 * D7 — every trip this driver has run, newest first.
 *
 * One read of the driver's own trips (RLS scopes it to them) plus one read of
 * the loads they reference, joined here because the generated types have no
 * reverse relationships. No paging: a driver's own history is a few hundred
 * rows in a year, and unlike the console's trip table this one is read by one
 * person on a phone. Filtering and month grouping happen on the client in
 * `historyState` — the alternative would be a round trip per filter tap.
 */
export function useDriverHistory(userId: string | null) {
  return useQuery({
    queryKey: ["driver", "history", userId],
    enabled: userId !== null && isSupabaseConfigured,
    queryFn: async (): Promise<HistoryRow[]> => {
      const trips = await supabase
        .from("trips")
        .select("id, load_id, status, started_at, ended_at, tracked_distance_m")
        .order("started_at", { ascending: false, nullsFirst: false })
        .limit(HISTORY_LIMIT);

      throwUnlessOk(trips.error);
      const rows = trips.data ?? [];
      if (rows.length === 0) {
        return [];
      }

      const loads = await supabase
        .from("loads")
        .select("id, load_code, pickup_address, drop_address")
        .in("id", [...new Set(rows.map((row) => row.load_id))]);

      throwUnlessOk(loads.error);
      const loadById = new Map((loads.data as LoadRow[]).map((row) => [row.id, row]));

      return rows.flatMap((row) => {
        const load = loadById.get(row.load_id);
        if (load === undefined) {
          return [];
        }
        return [
          {
            id: row.id,
            loadCode: load.load_code,
            pickupAddress: load.pickup_address,
            dropAddress: load.drop_address,
            status: row.status,
            startedAt: row.started_at,
            endedAt: row.ended_at,
            trackedDistanceKm:
              row.tracked_distance_m === null ? null : Math.round(row.tracked_distance_m / 1000),
          },
        ];
      });
    },
    staleTime: 30_000,
  });
}

/** A driver's own history is bounded; this is a guard, not a page size. */
export const HISTORY_LIMIT = 500;
