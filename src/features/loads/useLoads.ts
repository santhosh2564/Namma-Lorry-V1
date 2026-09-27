/**
 * Loads data (M7, doc 12 C2 / C4).
 *
 * Pagination, search, the date range and the status tab are all resolved in
 * Postgres: the console never downloads a whole table and slices it in the
 * browser. `range()` returns one page plus the exact total, which is what the
 * pager needs.
 *
 * The status tab is the awkward one, because `loads` has no status column
 * (ND-20). A load's status comes from its latest trip, so filtering by status
 * means resolving the tab to a set of `load_id`s first and then filtering
 * `loads.id` by that set. That is a second, small query — it selects one column
 * — and it keeps the paging correct: filtering after paging would show a page
 * of ten rows of which two match.
 *
 * Everything here reads under the admin-only `loads_admin` policy, so a
 * non-admin gets an empty list rather than somebody else's freight.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  OPEN_TRIP_STATUSES,
  PAGE_SIZE,
  loadStatusFrom,
  sanitiseSearchTerm,
  toDateBounds,
  toLoadInsert,
  toRange,
  tripStatusForTab,
  type CreateLoadValues,
  type DateRangeValues,
  type LoadStatus,
  type LoadStatusTab,
} from "@/features/loads/schemas";
import type { Tables } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";
import type { TripStatus } from "@/theme/status";

type LoadRow = Tables<"loads">;
type TripRow = Tables<"trips">;

/** The columns the C2 table shows, plus the endpoints C4 needs. */
const LOAD_COLUMNS =
  "id, load_code, pickup_address, pickup_lat, pickup_lng, pickup_radius_m, drop_address, drop_lat, drop_lng, drop_radius_m, planned_distance_m, material, weight_kg, notes, created_by, created_at";

export type LoadListRow = {
  id: string;
  loadCode: string;
  pickupAddress: string;
  pickup: { lat: number; lng: number; radiusM: number };
  dropAddress: string;
  drop: { lat: number; lng: number; radiusM: number };
  plannedDistanceM: number | null;
  material: string | null;
  weightKg: number | null;
  notes: string | null;
  createdAt: string;
  /** The load's open trip, or its most recent one once it is finished. */
  tripId: string | null;
  tripStatus: TripStatus | null;
  driverName: string | null;
  vehicleNo: string | null;
  /** Derived from `tripStatus` — ND-20. */
  status: LoadStatus;
};

export type LoadListParams = {
  page: number;
  tab: LoadStatusTab;
  search: string;
  range: DateRangeValues;
};

export type LoadListResult = {
  rows: LoadListRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export const LOADS_QUERY_KEY = ["console", "loads"] as const;

function throwUnlessOk(error: { message: string } | null): void {
  if (error) {
    throw new Error(error.message);
  }
}

/**
 * `load_id`s a status tab selects.
 *
 * Returns `null` for "all" (no filter). For "unassigned" it returns the loads
 * to *exclude* — the ones that still hold a trip, per `trips_one_open_per_load`.
 */
async function resolveTabIds(
  tab: LoadStatusTab,
): Promise<{ include: string[] | null; exclude: string[] }> {
  const statuses = tripStatusForTab(tab);
  if (statuses === null) {
    return { include: null, exclude: [] };
  }

  // "unassigned" is the complement of the open set, so the lookup is the same
  // read; only the direction of the filter differs.
  const wanted = statuses.length === 0 ? OPEN_TRIP_STATUSES : statuses;
  const { data, error } = await supabase.from("trips").select("load_id").in("status", wanted);

  throwUnlessOk(error);
  const ids = [...new Set((data ?? []).map((row) => row.load_id))];

  return statuses.length === 0 ? { include: null, exclude: ids } : { include: ids, exclude: [] };
}

/** Trips for the loads on the current page, so the table can show driver + status. */
async function fetchPageTrips(loadIds: string[]): Promise<Map<string, TripRow>> {
  if (loadIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("trips")
    .select("id, load_id, driver_id, vehicle_id, status, created_at, started_at, ended_at")
    .in("load_id", loadIds)
    .order("created_at", { ascending: false });

  throwUnlessOk(error);

  // Newest first, so the first row seen for a load is the one the tab and the
  // chip describe. A load can only have one *open* trip, but a rejected one
  // may sit behind a newer assignment, and the console wants the current one.
  const byLoad = new Map<string, TripRow>();
  for (const row of (data ?? []) as TripRow[]) {
    if (!byLoad.has(row.load_id)) {
      byLoad.set(row.load_id, row);
    }
  }
  return byLoad;
}

async function fetchDriverNames(driverIds: string[]): Promise<Map<string, string>> {
  if (driverIds.length === 0) {
    return new Map();
  }
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", driverIds);

  throwUnlessOk(error);
  return new Map((data ?? []).map((row) => [row.id, row.full_name]));
}

async function fetchRegistrations(vehicleIds: string[]): Promise<Map<string, string>> {
  if (vehicleIds.length === 0) {
    return new Map();
  }
  const { data, error } = await supabase
    .from("vehicles")
    .select("id, registration_no")
    .in("id", vehicleIds);

  throwUnlessOk(error);
  return new Map((data ?? []).map((row) => [row.id, row.registration_no]));
}

/** C2 — one page of loads, filtered and searched in the database. */
export function useLoads(params: LoadListParams) {
  const { from, to } = toRange({
    page: params.page,
    pageSize: PAGE_SIZE,
  });
  const term = sanitiseSearchTerm(params.search);
  const bounds = toDateBounds(params.range);

  return useQuery({
    // The page is in the key, so Previous/Next is a fetch, not a re-filter of
    // rows the client already has.
    queryKey: [...LOADS_QUERY_KEY, "list", { page: params.page, tab: params.tab, term, ...bounds }],
    queryFn: async (): Promise<LoadListResult> => {
      const { include, exclude } = await resolveTabIds(params.tab);

      let query = supabase.from("loads").select(LOAD_COLUMNS, { count: "exact" });

      if (term !== "") {
        // PostgREST `or()` across the three text columns a dispatcher would
        // search by: the Load ID, or either address.
        const like = `%${term}%`;
        query = query.or(
          `load_code.ilike.${like},pickup_address.ilike.${like},drop_address.ilike.${like}`,
        );
      }
      if (params.range.from !== "" || params.range.to !== "") {
        query = query
          .gte("created_at", bounds.gte ?? "0001-01-01")
          .lte("created_at", bounds.lte ?? "9999-12-31");
      }
      if (include !== null) {
        if (include.length === 0) {
          // No load has a trip in this status, so the tab is genuinely empty.
          return {
            rows: [],
            total: 0,
            page: params.page,
            pageSize: PAGE_SIZE,
            pageCount: 1,
          };
        }
        query = query.in("id", include);
      }
      if (exclude.length > 0) {
        query = query.not("id", "in", `(${exclude.join(",")})`);
      }

      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);

      throwUnlessOk(error);

      const loads = (data ?? []) as LoadRow[];
      const loadIds = loads.map((row) => row.id);
      const trips = await fetchPageTrips(loadIds);
      const tripList = [...trips.values()];

      const [driverNames, registrations] = await Promise.all([
        fetchDriverNames(tripList.map((trip) => trip.driver_id)),
        fetchRegistrations(tripList.map((trip) => trip.vehicle_id)),
      ]);

      const rows: LoadListRow[] = loads.map((load) => {
        const trip = trips.get(load.id);
        return {
          id: load.id,
          loadCode: load.load_code,
          pickupAddress: load.pickup_address,
          pickup: { lat: load.pickup_lat, lng: load.pickup_lng, radiusM: load.pickup_radius_m },
          dropAddress: load.drop_address,
          drop: { lat: load.drop_lat, lng: load.drop_lng, radiusM: load.drop_radius_m },
          plannedDistanceM: load.planned_distance_m,
          material: load.material,
          weightKg: load.weight_kg === null ? null : Number(load.weight_kg),
          notes: load.notes,
          createdAt: load.created_at,
          tripId: trip?.id ?? null,
          tripStatus: trip?.status ?? null,
          driverName: trip ? (driverNames.get(trip.driver_id) ?? null) : null,
          vehicleNo: trip ? (registrations.get(trip.vehicle_id) ?? null) : null,
          status: loadStatusFrom(trip?.status),
        };
      });

      const total = count ?? rows.length;
      return {
        rows,
        total,
        page: params.page,
        pageSize: PAGE_SIZE,
        pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      };
    },
    // Paging state is per-screen, not shared; keep the previous page visible
    // while the next one loads so the table does not flash empty.
    placeholderData: (previous) => previous,
    staleTime: 15_000,
  });
}

export type LoadDetail = LoadListRow & {
  createdBy: string | null;
  /** The driver's active trip, used for the "currently on another trip" warning. */
  driverBusy: boolean;
  driverVerifiedTrips: number;
  driverVerifiedKm: number;
};

/** C4 — one load, its latest trip and the driver's verified experience. */
export function useLoadDetail(loadId: string | null) {
  return useQuery({
    queryKey: [...LOADS_QUERY_KEY, "detail", loadId],
    queryFn: async (): Promise<LoadDetail | null> => {
      if (loadId === null) {
        return null;
      }

      const { data: loadRow, error: loadError } = await supabase
        .from("loads")
        .select(LOAD_COLUMNS)
        .eq("id", loadId)
        .maybeSingle();

      throwUnlessOk(loadError);
      if (!loadRow) {
        return null;
      }
      const load = loadRow as LoadRow;

      const trips = await fetchPageTrips([loadId]);
      const trip = trips.get(loadId) ?? null;

      const driverName = trip
        ? (await fetchDriverNames([trip.driver_id])).get(trip.driver_id)
        : null;
      const vehicleNo = trip
        ? (await fetchRegistrations([trip.vehicle_id])).get(trip.vehicle_id)
        : null;

      // The busy warning and the verified stats both come from the database,
      // never from what the console remembers about a driver.
      let driverBusy = false;
      let driverVerifiedTrips = 0;
      let driverVerifiedKm = 0;
      if (trip) {
        const [stats, busy] = await Promise.all([
          supabase
            .from("driver_stats")
            .select("verified_trips, verified_distance_m")
            .eq("driver_id", trip.driver_id)
            .maybeSingle(),
          supabase
            .from("trips")
            .select("id", { count: "exact", head: true })
            .eq("driver_id", trip.driver_id)
            .eq("status", "in_progress"),
        ]);

        throwUnlessOk(stats.error);
        throwUnlessOk(busy.error);
        driverVerifiedTrips = stats.data?.verified_trips ?? 0;
        driverVerifiedKm = Math.round((stats.data?.verified_distance_m ?? 0) / 1000);
        driverBusy = (busy.count ?? 0) > 0;
      }

      return {
        id: load.id,
        loadCode: load.load_code,
        pickupAddress: load.pickup_address,
        pickup: { lat: load.pickup_lat, lng: load.pickup_lng, radiusM: load.pickup_radius_m },
        dropAddress: load.drop_address,
        drop: { lat: load.drop_lat, lng: load.drop_lng, radiusM: load.drop_radius_m },
        plannedDistanceM: load.planned_distance_m,
        material: load.material,
        weightKg: load.weight_kg === null ? null : Number(load.weight_kg),
        notes: load.notes,
        createdAt: load.created_at,
        createdBy: load.created_by,
        tripId: trip?.id ?? null,
        tripStatus: trip?.status ?? null,
        driverName: driverName ?? null,
        vehicleNo: vehicleNo ?? null,
        status: loadStatusFrom(trip?.status),
        driverBusy,
        driverVerifiedTrips,
        driverVerifiedKm,
      };
    },
    enabled: loadId !== null,
    staleTime: 15_000,
  });
}

/**
 * C3 — save a load.
 *
 * `plannedDistanceM` is the value the proxy returned a moment earlier; the
 * function never calls Mappls itself, so a save is one insert with or without
 * that number. `load_code` is left to the database.
 */
export function useCreateLoad() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { values: CreateLoadValues; plannedDistanceM: number | null }) => {
      const { data, error } = await supabase
        .from("loads")
        .insert(toLoadInsert(input.values, input.plannedDistanceM))
        .select("id, load_code")
        .single();

      throwUnlessOk(error);
      return data as { id: string; load_code: string };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LOADS_QUERY_KEY });
    },
  });
}
