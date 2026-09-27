// Console queries for C1 Live, C6 Trip Detail & Review, C7 Review Queue (admin; RLS `trips_admin`,
// `points_read`, `live_read`, `events_read` via can_read_trip).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { consoleKeys } from '@/features/console/queries';
import { supabase } from '@/lib/supabase';
import { parseRpcError } from '@/tracking/errors';

/** docs/13 P12: trip_points are read 1000 per page (PostgREST's default max rows). */
export const POINTS_PAGE = 1000;

export const reviewKeys = {
  live: ['console', 'live'] as const,
  assignedToday: ['console', 'assigned-today'] as const,
  trip: (id: string) => ['console', 'trip', id] as const,
  points: (id: string) => ['console', 'trip', id, 'points'] as const,
  events: (id: string) => ['console', 'trip', id, 'events'] as const,
  queue: ['console', 'review-queue'] as const,
};

const PEOPLE =
  'driver:profiles!trips_driver_id_fkey(id, full_name, phone), vehicle:vehicles(id, registration_no, vehicle_type)';

// ---------- C1 Live ----------

async function fetchLiveTrips() {
  const { data, error } = await supabase
    .from('trips')
    .select(
      `id, started_at, ${PEOPLE}, load:loads(id, load_code, pickup_address, drop_address), live:trip_live(lat, lng, heading, speed_mps, accuracy_m, recorded_at, updated_at)`,
    )
    .eq('status', 'in_progress')
    .order('started_at', { ascending: true });
  if (error) throw error;
  return data;
}

export type LiveTrip = Awaited<ReturnType<typeof fetchLiveTrips>>[number];

export function useLiveTrips() {
  return useQuery({ queryKey: reviewKeys.live, queryFn: fetchLiveTrips, refetchInterval: 60_000 });
}

/** KPI "assigned today": trips created since IST midnight. */
export function useAssignedToday(sinceIso: string) {
  return useQuery({
    queryKey: [...reviewKeys.assignedToday, sinceIso],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('trips')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', sinceIso);
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });
}

// ---------- C6 Trip detail ----------

async function fetchTrip(id: string) {
  const { data, error } = await supabase
    .from('trips')
    .select(
      `id, status, created_at, started_at, ended_at, start_lat, start_lng, start_accuracy_m, end_lat, end_lng, end_accuracy_m, expected_points, tracked_distance_m, verification_reasons, verification_metrics, verified_at, review_note, device_info, ${PEOPLE}, reviewer:profiles!trips_reviewed_by_fkey(full_name), load:loads(id, load_code, pickup_address, pickup_lat, pickup_lng, pickup_radius_m, drop_address, drop_lat, drop_lng, drop_radius_m, planned_distance_m, material, weight_kg), live:trip_live(lat, lng, heading, recorded_at)`,
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type ConsoleTrip = NonNullable<Awaited<ReturnType<typeof fetchTrip>>>;

export function useConsoleTrip(id: string) {
  return useQuery({ queryKey: reviewKeys.trip(id), queryFn: () => fetchTrip(id) });
}

export interface RoutePoint {
  seq: number;
  lat: number;
  lng: number;
  recorded_at: string;
  heading: number | null;
  speed_mps: number | null;
  accuracy_m: number | null;
  is_mocked: boolean;
}

type PageFetcher = (from: number, to: number) => Promise<{ data: RoutePoint[] | null; error: unknown }>;

/** Reads every page of POINTS_PAGE rows (ordered by seq) until a short page. */
export async function fetchAllPoints(fetchPage: PageFetcher, pageSize = POINTS_PAGE): Promise<RoutePoint[]> {
  const all: RoutePoint[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) return all;
  }
}

export function useTripPoints(id: string, enabled = true) {
  return useQuery({
    queryKey: reviewKeys.points(id),
    enabled,
    queryFn: () =>
      fetchAllPoints(async (from, to) => {
        const { data, error } = await supabase
          .from('trip_points')
          .select('seq, lat, lng, recorded_at, heading, speed_mps, accuracy_m, is_mocked')
          .eq('trip_id', id)
          .order('seq', { ascending: true })
          .range(from, to);
        return { data, error };
      }),
  });
}

export function useTripEvents(id: string) {
  return useQuery({
    queryKey: reviewKeys.events(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trip_events')
        .select('id, type, payload, created_at, actor_id')
        .eq('trip_id', id)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export type TripEvent = NonNullable<ReturnType<typeof useTripEvents>['data']>[number];

export class ReviewError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

/**
 * admin_review_trip with a mandatory note. No optimistic update: after the call (success or
 * failure) the trip, events and queue are refetched from the server (docs/13 P12).
 */
export function useReviewDecision(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ approve, note }: { approve: boolean; note: string }) => {
      const trimmed = note.trim();
      if (!trimmed) throw new ReviewError('NOTE_REQUIRED');
      const { data, error } = await supabase.rpc('admin_review_trip', {
        p_trip_id: tripId,
        p_approve: approve,
        p_note: trimmed,
      });
      if (error) throw new ReviewError(parseRpcError(error).code);
      // 0001 returns null for an unknown trip instead of raising (ND-21 audit item).
      if (!data) throw new ReviewError('TRIP_NOT_FOUND');
      return data;
    },
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: reviewKeys.trip(tripId) }),
        qc.invalidateQueries({ queryKey: reviewKeys.events(tripId) }),
        qc.invalidateQueries({ queryKey: reviewKeys.queue }),
        qc.invalidateQueries({ queryKey: consoleKeys.reviewCount }),
        qc.invalidateQueries({ queryKey: consoleKeys.drivers }),
        qc.invalidateQueries({ queryKey: ['trips', 'list'] }),
      ]),
  });
}

// ---------- C7 Review queue ----------

async function fetchQueue() {
  const { data, error } = await supabase
    .from('trips')
    .select(
      `id, started_at, ended_at, end_lat, end_lng, start_lat, start_lng, verification_reasons, verification_metrics, ${PEOPLE}, load:loads(id, load_code, pickup_address, pickup_lat, pickup_lng, drop_address, drop_lat, drop_lng, drop_radius_m)`,
    )
    .eq('status', 'needs_review')
    .order('ended_at', { ascending: true, nullsFirst: true });
  if (error) throw error;
  return data;
}

export type QueueTrip = Awaited<ReturnType<typeof fetchQueue>>[number];

export function useReviewQueue() {
  return useQuery({ queryKey: reviewKeys.queue, queryFn: fetchQueue, refetchInterval: 60_000 });
}
