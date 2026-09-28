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
import { useQuery } from "@tanstack/react-query";

import type { Tables } from "@/lib/database.types";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type TripRow = Tables<"trips">;

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

/** D4 — one trip with everything the start flow needs. */
export function useDriverTrip(tripId: string | null) {
  return useQuery({
    queryKey: ["driver", "trip", tripId],
    enabled: tripId !== null && isSupabaseConfigured,
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
