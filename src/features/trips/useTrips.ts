/**
 * Trips data (M7, doc 12 C5, and the C4 assignment write).
 *
 * The list is paged, filtered and searched in Postgres for the same reason the
 * loads list is: a console that downloads every trip to paginate in the browser
 * stops working on the first month of real data.
 *
 * The one write is the C4 assignment. It is a plain insert under the
 * `trips_admin` policy, not an RPC: assigning a trip is not a verification
 * decision, and docs/06 keeps the RPCs for the status transitions that
 * `verify_trip` and `admin_review_trip` own. Two unique indexes do the real
 * safety work — `trips_one_active_per_driver` and `trips_one_open_per_load` —
 * and the console turns their errors into a message instead of a stack trace.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  PAGE_SIZE,
  sanitiseSearchTerm,
  toDateBounds,
  toRange,
  type AssignTripValues,
  type DateRangeValues,
} from "@/features/loads/schemas";
import { LOADS_QUERY_KEY } from "@/features/loads/useLoads";
import type { Tables } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";
import type { TripStatus } from "@/theme/status";

type TripRow = Tables<"trips">;

export type TripListRow = {
  id: string;
  loadId: string;
  loadCode: string;
  driverName: string;
  vehicleNo: string;
  status: TripStatus;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  /** Only `verify_trip` writes this; the console displays it, never computes it. */
  trackedDistanceKm: number | null;
  reasons: string[];
};

export type TripListParams = {
  page: number;
  statuses: TripStatus[];
  driverId: string | null;
  vehicleId: string | null;
  search: string;
  range: DateRangeValues;
};

export type TripListResult = {
  rows: TripListRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export const TRIPS_QUERY_KEY = ["console", "trips"] as const;

function throwUnlessOk(error: { message: string } | null): void {
  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Supabase error → console message key.
 *
 * The two unique indexes are the guard rail behind "one open trip per load" and
 * "one live trip per driver" (docs/08 / 0001), so their violation is a normal
 * thing a dispatcher hits, not a crash: it gets the same treatment as any other
 * failure and the screen keeps the form filled in.
 */
export function assignErrorKey(message: string): string {
  if (message.includes("trips_one_open_per_load")) {
    return "console.load.alreadyHasTrip";
  }
  if (message.includes("trips_one_active_per_driver")) {
    return "console.load.driverOnTrip";
  }
  if (message.includes("trips_load_id_fkey")) {
    return "console.load.invalidId";
  }
  if (message.includes("trips_vehicle_id_fkey")) {
    return "console.load.invalidVehicle";
  }
  if (message.includes("trips_driver_id_fkey")) {
    return "console.load.invalidDriver";
  }
  return "console.load.assignFailed";
}

/**
 * C5 — one page of trips.
 *
 * Search is by Load ID, which lives on `loads`, so the term is resolved to load
 * ids first (one narrow query) and the trip query filters on them.
 */
export function useTrips(params: TripListParams) {
  const { from, to } = toRange({ page: params.page, pageSize: PAGE_SIZE });
  const term = sanitiseSearchTerm(params.search);
  const bounds = toDateBounds(params.range);

  return useQuery({
    queryKey: [
      ...TRIPS_QUERY_KEY,
      "list",
      {
        page: params.page,
        statuses: params.statuses,
        driverId: params.driverId,
        vehicleId: params.vehicleId,
        term,
        ...bounds,
      },
    ],
    queryFn: async (): Promise<TripListResult> => {
      // Resolve a Load ID search into load ids before paging, so the result
      // set is correct rather than "ten rows, one of which matched".
      let searchLoadIds: string[] | null = null;
      if (term !== "") {
        const { data, error } = await supabase
          .from("loads")
          .select("id")
          .ilike("load_code", `%${term}%`);

        throwUnlessOk(error);
        searchLoadIds = (data ?? []).map((row) => row.id);
        if (searchLoadIds.length === 0) {
          return { rows: [], total: 0, page: params.page, pageSize: PAGE_SIZE, pageCount: 1 };
        }
      }

      let query = supabase.from("trips").select("*", { count: "exact" });

      if (searchLoadIds !== null) {
        query = query.in("load_id", searchLoadIds);
      }
      if (params.statuses.length > 0) {
        query = query.in("status", params.statuses);
      }
      if (params.driverId !== null) {
        query = query.eq("driver_id", params.driverId);
      }
      if (params.vehicleId !== null) {
        query = query.eq("vehicle_id", params.vehicleId);
      }
      if (params.range.from !== "" || params.range.to !== "") {
        query = query
          .gte("created_at", bounds.gte ?? "0001-01-01")
          .lte("created_at", bounds.lte ?? "9999-12-31");
      }

      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);

      throwUnlessOk(error);

      const trips = (data ?? []) as TripRow[];

      // Driver and vehicle names are resolved for the page only, in two small
      // reads, because the generated types have no reverse relationships.
      const [drivers, vehicles, loads] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", [...new Set(trips.map((trip) => trip.driver_id))]),
        supabase
          .from("vehicles")
          .select("id, registration_no")
          .in("id", [...new Set(trips.map((trip) => trip.vehicle_id))]),
        supabase
          .from("loads")
          .select("id, load_code")
          .in("id", [...new Set(trips.map((trip) => trip.load_id))]),
      ]);

      throwUnlessOk(drivers.error);
      throwUnlessOk(vehicles.error);
      throwUnlessOk(loads.error);

      const driverNames = new Map((drivers.data ?? []).map((row) => [row.id, row.full_name]));
      const registrations = new Map(
        (vehicles.data ?? []).map((row) => [row.id, row.registration_no]),
      );
      const loadCodes = new Map((loads.data ?? []).map((row) => [row.id, row.load_code]));

      const rows: TripListRow[] = trips.map((trip) => ({
        id: trip.id,
        loadId: trip.load_id,
        loadCode: loadCodes.get(trip.load_id) ?? "—",
        driverName: driverNames.get(trip.driver_id) ?? "—",
        vehicleNo: registrations.get(trip.vehicle_id) ?? "—",
        status: trip.status,
        startedAt: trip.started_at,
        endedAt: trip.ended_at,
        createdAt: trip.created_at,
        trackedDistanceKm:
          trip.tracked_distance_m === null ? null : Math.round(trip.tracked_distance_m / 1000),
        reasons: trip.verification_reasons,
      }));

      const total = count ?? rows.length;
      return {
        rows,
        total,
        page: params.page,
        pageSize: PAGE_SIZE,
        pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      };
    },
    placeholderData: (previous) => previous,
    staleTime: 15_000,
  });
}

/** C4 — assign a load to a driver and a vehicle, creating the `trips` row. */
export function useAssignTrip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: AssignTripValues) => {
      const { data, error } = await supabase
        .from("trips")
        .insert({
          load_id: values.loadId,
          driver_id: values.driverId,
          vehicle_id: values.vehicleId,
          // The enum default is 'assigned'; naming it keeps the console's
          // intent visible next to the two unique indexes it must satisfy.
          status: "assigned",
        })
        .select("id, load_id, driver_id, vehicle_id, status, created_at")
        .single();

      if (error) {
        throw new Error(assignErrorKey(error.message));
      }
      return data as Pick<
        TripRow,
        "id" | "load_id" | "driver_id" | "vehicle_id" | "status" | "created_at"
      >;
    },
    onSuccess: () => {
      // The load's status is derived from its trip, so both lists are now
      // stale: the load moved from "unassigned" to "assigned".
      void queryClient.invalidateQueries({ queryKey: LOADS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: TRIPS_QUERY_KEY });
    },
  });
}

/** Drivers available to assign, with the busy flag C4 warns on. */
export function useAssignableDrivers() {
  return useQuery({
    queryKey: ["console", "assignable-drivers"],
    queryFn: async () => {
      const [drivers, stats, busy] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, phone, is_active")
          .eq("role", "driver")
          .eq("is_active", true)
          .order("full_name"),
        supabase.from("driver_stats").select("driver_id, verified_trips, verified_distance_m"),
        supabase.from("trips").select("driver_id").eq("status", "in_progress"),
      ]);

      throwUnlessOk(drivers.error);
      throwUnlessOk(stats.error);
      throwUnlessOk(busy.error);

      const statsByDriver = new Map((stats.data ?? []).map((row) => [row.driver_id, row]));
      // A driver with a live trip cannot start another one.
      const busyDrivers = new Set((busy.data ?? []).map((row) => row.driver_id));

      return (drivers.data ?? []).map((driver) => ({
        id: driver.id,
        fullName: driver.full_name,
        phone: driver.phone ?? "",
        verifiedTrips: statsByDriver.get(driver.id)?.verified_trips ?? 0,
        verifiedKm: Math.round((statsByDriver.get(driver.id)?.verified_distance_m ?? 0) / 1000),
        isBusy: busyDrivers.has(driver.id),
      }));
    },
    staleTime: 30_000,
  });
}
