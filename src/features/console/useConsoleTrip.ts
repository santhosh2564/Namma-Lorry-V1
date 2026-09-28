/**
 * C6 / C7 console trip data (M11, docs/12 C6–C7, docs/06 §2–§3).
 *
 * The console is the read-mostly half of the product: it watches trips, replays
 * them and clears the review queue. Three things it needs from the database are
 * not derivable anywhere else:
 *
 * - **The route** — `trip_points`, which is by far the biggest table in the
 *   schema. A nine-hour trip is thousands of rows, so it is paged at
 *   {@link POINTS_PAGE_SIZE} rows per request and the screen asks for another
 *   page as the reviewer scrubs. Nothing is summarised on the way through: the
 *   replay has to be the recorded points, not a resampled line.
 * - **The live tail** — while a trip is still running, new points arrive
 *   through a `postgres_changes` subscription on `trip_points` (migration 0004
 *   publishes it) and are appended to the route the reviewer is looking at.
 * - **The verdict** — `admin_review_trip` is an RPC, not a write: it checks the
 *   caller is an admin, refuses a decision without a note, refuses a trip that
 *   is no longer in review, writes the audit event and moves `driver_stats`. The
 *   client never edits the trip row itself.
 *
 * There is deliberately **no optimistic update** after a decision (docs/12 C6):
 * the row, the queue and the driver's totals all move server-side, and the
 * screen re-reads them.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { reviewErrorKey } from "@/features/console/reviewState";
import { REVIEW_QUEUE_COUNT_KEY } from "@/features/drivers/useDrivers";
import { TRIPS_QUERY_KEY } from "@/features/trips/useTrips";
import type { Json, Tables } from "@/lib/database.types";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { TripStatus } from "@/theme/status";

type TripRow = Tables<"trips">;
type LoadRow = Tables<"loads">;
type ProfileRow = Tables<"profiles">;
type VehicleRow = Tables<"vehicles">;
type PointRow = Tables<"trip_points">;
type EventRow = Tables<"trip_events">;

/** Rows per `trip_points` request (docs/06 §2: "paged, 1000 per page"). */
export const POINTS_PAGE_SIZE = 1000;

export const CONSOLE_TRIP_QUERY_KEY = ["console", "trip"] as const;
export const REVIEW_QUEUE_QUERY_KEY = ["console", "review-queue"] as const;

function throwUnlessOk(error: { message: string } | null): void {
  if (error) {
    throw new Error(error.message);
  }
}

/** Everything C6 shows about one trip. */
export type ConsoleTrip = {
  id: string;
  loadId: string;
  loadCode: string;
  driverId: string;
  driverName: string;
  vehicleNo: string;
  status: TripStatus;
  startedAt: string | null;
  endedAt: string | null;
  startLat: number | null;
  startLng: number | null;
  endLat: number | null;
  endLng: number | null;
  expectedPoints: number | null;
  trackedDistanceM: number | null;
  reasons: string[];
  metrics: Json | null;
  reviewNote: string | null;
  reviewedByName: string | null;
  pickupAddress: string;
  dropAddress: string;
  pickup: { lat: number; lng: number };
  drop: { lat: number; lng: number };
  pickupRadiusM: number;
  dropRadiusM: number;
  plannedDistanceM: number | null;
};

const EMPTY_TRIP_METRICS = {
  pickupAddress: "",
  dropAddress: "",
  pickup: { lat: 0, lng: 0 },
  drop: { lat: 0, lng: 0 },
  pickupRadiusM: 0,
  dropRadiusM: 0,
};

/**
 * C6 — one trip with its load, driver and vehicle.
 *
 * The trip row is read with a single follow-up read of the three tables it
 * points at, because the generated types have no reverse relationships to nest
 * on (see `useLiveTrips`).
 */
export function useConsoleTrip(tripId: string | null) {
  return useQuery({
    queryKey: [...CONSOLE_TRIP_QUERY_KEY, tripId],
    enabled: tripId !== null && isSupabaseConfigured,
    queryFn: async (): Promise<ConsoleTrip | null> => {
      const trip = await supabase
        .from("trips")
        .select("*")
        .eq("id", tripId ?? "")
        .maybeSingle();
      throwUnlessOk(trip.error);

      if (trip.data === null) {
        return null;
      }
      const row = trip.data as TripRow;

      const [load, driver, vehicle, reviewer] = await Promise.all([
        supabase.from("loads").select("*").eq("id", row.load_id).maybeSingle(),
        supabase.from("profiles").select("id, full_name").eq("id", row.driver_id).maybeSingle(),
        supabase
          .from("vehicles")
          .select("id, registration_no")
          .eq("id", row.vehicle_id)
          .maybeSingle(),
        row.reviewed_by === null
          ? Promise.resolve({ data: null, error: null })
          : supabase
              .from("profiles")
              .select("id, full_name")
              .eq("id", row.reviewed_by)
              .maybeSingle(),
      ]);

      throwUnlessOk(load.error);
      throwUnlessOk(driver.error);
      throwUnlessOk(vehicle.error);
      throwUnlessOk(reviewer.error);

      const loadRow = load.data as LoadRow | null;

      return {
        id: row.id,
        loadId: row.load_id,
        loadCode: loadRow?.load_code ?? "—",
        driverId: row.driver_id,
        driverName: (driver.data as ProfileRow | null)?.full_name ?? "—",
        vehicleNo: (vehicle.data as VehicleRow | null)?.registration_no ?? "—",
        status: row.status,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        startLat: row.start_lat,
        startLng: row.start_lng,
        endLat: row.end_lat,
        endLng: row.end_lng,
        expectedPoints: row.expected_points,
        trackedDistanceM: row.tracked_distance_m,
        reasons: row.verification_reasons,
        metrics: row.verification_metrics,
        reviewNote: row.review_note,
        reviewedByName: (reviewer.data as ProfileRow | null)?.full_name ?? null,
        pickupAddress: loadRow?.pickup_address ?? EMPTY_TRIP_METRICS.pickupAddress,
        dropAddress: loadRow?.drop_address ?? EMPTY_TRIP_METRICS.dropAddress,
        pickup: loadRow
          ? { lat: loadRow.pickup_lat, lng: loadRow.pickup_lng }
          : EMPTY_TRIP_METRICS.pickup,
        drop: loadRow ? { lat: loadRow.drop_lat, lng: loadRow.drop_lng } : EMPTY_TRIP_METRICS.drop,
        pickupRadiusM: loadRow?.pickup_radius_m ?? 0,
        dropRadiusM: loadRow?.drop_radius_m ?? 0,
        plannedDistanceM: loadRow?.planned_distance_m ?? null,
      };
    },
    staleTime: 10_000,
  });
}

export type RoutePoint = {
  seq: number;
  recordedAt: string;
  lat: number;
  lng: number;
  accuracyM: number | null;
  speedMps: number | null;
  isMocked: boolean;
};

export type TripRoute = {
  /** Every point loaded so far, oldest first. */
  points: RoutePoint[];
  /** Total rows on the server, so the screen can say "load more". */
  total: number;
  /** Pages available at {@link POINTS_PAGE_SIZE} rows. */
  pageCount: number;
};

function toRoutePoint(row: PointRow): RoutePoint {
  return {
    seq: row.seq,
    recordedAt: row.recorded_at,
    lat: row.lat,
    lng: row.lng,
    accuracyM: row.accuracy_m,
    speedMps: row.speed_mps,
    isMocked: row.is_mocked,
  };
}

/**
 * C6 — the recorded route, a page at a time.
 *
 * `page` is "load up to page N": each request is the same 1000-row range the
 * server would return on its own, and the pages are merged in order here. The
 * reviewer who wants the whole route asks for more; the one who only wants the
 * last twenty minutes does not.
 */
export function useTripRoute(tripId: string | null, page: number) {
  return useQuery({
    queryKey: [...CONSOLE_TRIP_QUERY_KEY, tripId, "route", page],
    enabled: tripId !== null && isSupabaseConfigured && page > 0,
    queryFn: async (): Promise<TripRoute> => {
      // The first page is also where the exact total comes from, so a reviewer
      // sees "3,412 points · 4 pages" before asking for the rest.
      const first = await supabase
        .from("trip_points")
        .select("*", { count: "exact" })
        .eq("trip_id", tripId ?? "")
        .order("seq", { ascending: true })
        .range(0, POINTS_PAGE_SIZE - 1);

      throwUnlessOk(first.error);

      const total = first.count ?? (first.data ?? []).length;
      const pageCount = Math.max(1, Math.ceil(total / POINTS_PAGE_SIZE));
      const wanted = Math.max(1, Math.min(page, pageCount));
      const rows = [...((first.data ?? []) as PointRow[])];

      for (let next = 2; next <= wanted; next += 1) {
        const start = (next - 1) * POINTS_PAGE_SIZE;
        const pageRows = await supabase
          .from("trip_points")
          .select("*")
          .eq("trip_id", tripId ?? "")
          .order("seq", { ascending: true })
          .range(start, start + POINTS_PAGE_SIZE - 1);

        throwUnlessOk(pageRows.error);
        rows.push(...((pageRows.data ?? []) as PointRow[]));
      }

      return {
        points: rows.map(toRoutePoint),
        total,
        pageCount,
      };
    },
    // The page is the cache key, so going back is instant and never re-reads.
    staleTime: 30_000,
  });
}

/**
 * C6 — points that arrive while the trip is running.
 *
 * The route query is a snapshot; a live trip needs its tail. Every INSERT for
 * this trip is appended to local state, de-duplicated by `seq` against what has
 * already loaded, and capped so a long-running tab cannot grow without bound.
 * Nothing is written to the query cache: the paged read stays a paged read.
 */
export function useTripPointStream(tripId: string | null, enabled: boolean) {
  // The state remembers which trip it belongs to, so switching trips empties it
  // by derivation rather than by a setState in an effect (which would cascade a
  // render and flash the previous trip's points on the new one).
  const [state, setState] = useState<{ tripId: string | null; points: RoutePoint[] }>({
    tripId: null,
    points: [],
  });

  useEffect(() => {
    if (!enabled || tripId === null || !isSupabaseConfigured) {
      return;
    }

    const channel = supabase
      .channel(`trip-points-${tripId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "trip_points",
          filter: `trip_id=eq.${tripId}`,
        },
        (payload) => {
          const row = payload.new as PointRow;
          if (row === null || row === undefined) {
            return;
          }
          const point = toRoutePoint(row);
          setState((current) => {
            const points = current.tripId === tripId ? current.points : [];
            if (points.some((existing) => existing.seq === point.seq)) {
              return current;
            }
            return {
              tripId,
              points: [...points, point].sort((a, b) => a.seq - b.seq).slice(-LIVE_POINT_TAIL),
            };
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, tripId]);

  return state.tripId === tripId ? state.points : EMPTY_LIVE_POINTS;
}

const EMPTY_LIVE_POINTS: RoutePoint[] = [];

/** Enough of a tail to be useful; a browser tab open all day must not grow. */
export const LIVE_POINT_TAIL = 2_000;

/** Pure: the page's points plus the live tail, ordered and de-duplicated. */
export function mergeRoutePoints(
  loaded: readonly RoutePoint[],
  live: readonly RoutePoint[],
): RoutePoint[] {
  if (live.length === 0) {
    return [...loaded];
  }
  const bySeq = new Map<number, RoutePoint>();
  for (const point of loaded) {
    bySeq.set(point.seq, point);
  }
  for (const point of live) {
    if (!bySeq.has(point.seq)) {
      bySeq.set(point.seq, point);
    }
  }
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

export type TripEvent = {
  id: number;
  type: string;
  createdAt: string;
  actorName: string | null;
  payload: Json | null;
};

/** C6 — the audit timeline (`trip_events`), oldest first. */
export function useTripEvents(tripId: string | null) {
  return useQuery({
    queryKey: [...CONSOLE_TRIP_QUERY_KEY, tripId, "events"],
    enabled: tripId !== null && isSupabaseConfigured,
    queryFn: async (): Promise<TripEvent[]> => {
      const events = await supabase
        .from("trip_events")
        .select("*")
        .eq("trip_id", tripId ?? "")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });

      throwUnlessOk(events.error);
      const rows = (events.data ?? []) as EventRow[];

      // The reviewer is a person, not an id: resolve the few distinct actors.
      const actorIds = [...new Set(rows.map((row) => row.actor_id).filter((id) => id !== null))];
      const actors =
        actorIds.length === 0
          ? { data: [], error: null }
          : await supabase
              .from("profiles")
              .select("id, full_name")
              .in("id", actorIds as string[]);
      throwUnlessOk(actors.error);

      const names = new Map(
        ((actors.data ?? []) as ProfileRow[]).map((row) => [row.id, row.full_name]),
      );

      return rows.map((row) => ({
        id: row.id,
        type: row.type,
        createdAt: row.created_at,
        actorName: row.actor_id === null ? null : (names.get(row.actor_id) ?? null),
        payload: row.payload,
      }));
    },
    staleTime: 30_000,
  });
}

/** One row of the C7 queue. */
export type ReviewQueueRow = {
  id: string;
  loadCode: string;
  driverName: string;
  vehicleNo: string;
  pickupAddress: string;
  dropAddress: string;
  startedAt: string | null;
  endedAt: string | null;
  reasons: string[];
  pickup: { lat: number; lng: number };
  drop: { lat: number; lng: number };
  dropRadiusM: number;
};

/**
 * C7 — trips waiting for a decision, oldest first.
 *
 * "Oldest" is the end time, because that is when the ops team stopped being able
 * to close the day: a trip flagged at 08:00 and one flagged at 19:00 are both
 * on this board, and the one that has been waiting all day comes first.
 */
export function useReviewQueue() {
  return useQuery({
    queryKey: REVIEW_QUEUE_QUERY_KEY,
    enabled: isSupabaseConfigured,
    queryFn: async (): Promise<ReviewQueueRow[]> => {
      const trips = await supabase
        .from("trips")
        .select("*")
        .eq("status", "needs_review")
        .order("ended_at", { ascending: true })
        .order("id", { ascending: true });

      throwUnlessOk(trips.error);
      const rows = (trips.data ?? []) as TripRow[];
      if (rows.length === 0) {
        return [];
      }

      const [loads, drivers, vehicles] = await Promise.all([
        supabase
          .from("loads")
          .select(
            "id, load_code, pickup_address, drop_address, pickup_lat, pickup_lng, drop_lat, drop_lng, drop_radius_m",
          ),
        supabase
          .from("profiles")
          .select("id, full_name")
          .in(
            "id",
            rows.map((row) => row.driver_id),
          ),
        supabase
          .from("vehicles")
          .select("id, registration_no")
          .in(
            "id",
            rows.map((row) => row.vehicle_id),
          ),
      ]);

      throwUnlessOk(loads.error);
      throwUnlessOk(drivers.error);
      throwUnlessOk(vehicles.error);

      const loadById = new Map((loads.data as LoadRow[]).map((row) => [row.id, row]));
      const driverById = new Map(
        (drivers.data as ProfileRow[]).map((row) => [row.id, row.full_name]),
      );
      const vehicleById = new Map(
        (vehicles.data as VehicleRow[]).map((row) => [row.id, row.registration_no]),
      );

      return rows.flatMap((row) => {
        const load = loadById.get(row.load_id);
        if (load === undefined) {
          return [];
        }
        return [
          {
            id: row.id,
            loadCode: load.load_code,
            driverName: driverById.get(row.driver_id) ?? "—",
            vehicleNo: vehicleById.get(row.vehicle_id) ?? "—",
            pickupAddress: load.pickup_address,
            dropAddress: load.drop_address,
            startedAt: row.started_at,
            endedAt: row.ended_at,
            reasons: row.verification_reasons,
            pickup: { lat: load.pickup_lat, lng: load.pickup_lng },
            drop: { lat: load.drop_lat, lng: load.drop_lng },
            dropRadiusM: load.drop_radius_m,
          },
        ];
      });
    },
    // The queue changes when a decision is made elsewhere, so it is never stale
    // for long — and the C5 list and the sidebar badge are refetched with it.
    refetchInterval: 60_000,
    staleTime: 15_000,
  });
}

/**
 * C6 — the review decision.
 *
 * `admin_review_trip` refuses an empty note, a trip that is no longer in review
 * and a non-admin; those are ordinary outcomes of a shared queue, so they are
 * mapped to messages rather than left as raw database text.
 */
export function useAdminReviewTrip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { tripId: string; approve: boolean; note: string }) => {
      const { data, error } = await supabase.rpc("admin_review_trip", {
        p_trip_id: input.tripId,
        p_approve: input.approve,
        p_note: input.note,
      });

      if (error) {
        throw new Error(reviewErrorKey(error.message));
      }
      return data as TripRow;
    },
    onSuccess: () => {
      // No optimistic write: the decision moved the trip, the queue, the
      // sidebar badge and (on approval) the driver's verified totals, and only
      // the server knows all four.
      void queryClient.invalidateQueries({ queryKey: CONSOLE_TRIP_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: REVIEW_QUEUE_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: REVIEW_QUEUE_COUNT_KEY });
      void queryClient.invalidateQueries({ queryKey: TRIPS_QUERY_KEY });
    },
  });
}
