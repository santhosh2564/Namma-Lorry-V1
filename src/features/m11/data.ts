/**
 * M11 data access. Read-only table queries + the admin_review_trip RPC; no client
 * writes to trips or driver_stats (CLAUDE.md hard rules 1–2).
 *
 * Errors are thrown (never swallowed) so screens can show an error state with retry.
 * Demo data is used only in development with no Supabase client configured.
 */
import { NotConfiguredError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

import { demoEvents, demoLiveTrips, demoPoints, demoProfile, demoTrips } from './demo';
import type { DriverStats, LiveTrip, Trip, TripEvent, TripPoint } from './types';

type Row = Record<string, unknown>;

const stringValue = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value : fallback;
const numberValue = (value: unknown, fallback = 0) =>
  typeof value === 'number' ? value : fallback;
const nullableNumber = (value: unknown) => (typeof value === 'number' ? value : null);
const nullableString = (value: unknown) => (typeof value === 'string' ? value : null);
const stringArray = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

/** Supabase client, or null when running the dev demo; throws when unconfigured outside dev. */
function client() {
  if (supabase) return supabase;
  if (__DEV__) return null;
  throw new NotConfiguredError();
}

const TRIP_SELECT = '*, load:loads(*), profile:profiles!trips_driver_id_fkey(full_name)';

function mapTrip(row: Row): Trip {
  const load = (row.load as Row | null) ?? {};
  const driver = (row.profile as Row | null) ?? {};
  return {
    id: stringValue(row.id),
    load_id: stringValue(row.load_id),
    load_code: stringValue(load.load_code),
    pickup_address: stringValue(load.pickup_address),
    drop_address: stringValue(load.drop_address),
    pickup_lat: numberValue(load.pickup_lat),
    pickup_lng: numberValue(load.pickup_lng),
    drop_lat: numberValue(load.drop_lat),
    drop_lng: numberValue(load.drop_lng),
    planned_distance_m: nullableNumber(load.planned_distance_m),
    driver_id: stringValue(row.driver_id),
    driver_name: stringValue(driver.full_name),
    status: stringValue(row.status, 'assigned') as Trip['status'],
    started_at: nullableString(row.started_at),
    ended_at: nullableString(row.ended_at),
    tracked_distance_m: nullableNumber(row.tracked_distance_m),
    verification_reasons: stringArray(row.verification_reasons),
    verification_metrics: (row.verification_metrics as Trip['verification_metrics']) ?? null,
    review_note: nullableString(row.review_note),
  };
}

/** Trips visible to the caller (RLS: a driver sees own trips, an admin sees all). */
export async function fetchTrips(status?: Trip['status']): Promise<Trip[]> {
  const db = client();
  if (!db) return demoTrips().filter((trip) => !status || trip.status === status);
  let query = db.from('trips').select(TRIP_SELECT).order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => mapTrip(row as Row));
}

export async function fetchTrip(id: string): Promise<Trip | null> {
  const db = client();
  if (!db) return demoTrips().find((trip) => trip.id === id) ?? null;
  const { data, error } = await db.from('trips').select(TRIP_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? mapTrip(data as Row) : null;
}

export async function fetchLiveTrips(): Promise<LiveTrip[]> {
  const db = client();
  if (!db) return demoLiveTrips();
  const { data, error } = await db
    .from('trip_live')
    .select(
      '*, trip:trips!trip_live_trip_id_fkey(status, load:loads(load_code), profile:profiles!trips_driver_id_fkey(full_name))',
    );
  if (error) throw error;
  return (data ?? [])
    .filter((row) => (row.trip as Row | null)?.status === 'in_progress')
    .map((row) => {
      const trip = (row.trip as Row | null) ?? {};
      const load = (trip.load as Row | null) ?? {};
      const profile = (trip.profile as Row | null) ?? {};
      return {
        trip_id: stringValue(row.trip_id),
        driver_id: stringValue(row.driver_id),
        driver_name: stringValue(profile.full_name),
        load_code: stringValue(load.load_code),
        status: 'in_progress' as const,
        lat: numberValue(row.lat),
        lng: numberValue(row.lng),
        speed_mps: nullableNumber(row.speed_mps),
        heading: nullableNumber(row.heading),
        recorded_at: stringValue(row.recorded_at),
        updated_at: stringValue(row.updated_at),
      };
    });
}

const POINT_COLUMNS = 'trip_id,seq,recorded_at,lat,lng,accuracy_m,speed_mps,heading';

/** Full route, 1,000 rows per page (docs/06 §2). A failed page fails the whole load — never a silently partial route. */
export async function fetchTripPoints(id: string): Promise<TripPoint[]> {
  const db = client();
  if (!db) {
    const trip = demoTrips().find((item) => item.id === id);
    return trip ? demoPoints(trip) : [];
  }
  const pageSize = 1000;
  const points: TripPoint[] = [];
  for (let page = 0; ; page += 1) {
    const { data, error } = await db
      .from('trip_points')
      .select(POINT_COLUMNS)
      .eq('trip_id', id)
      .order('seq', { ascending: true })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) throw error;
    points.push(...((data ?? []) as TripPoint[]));
    if (!data || data.length < pageSize) return points;
  }
}

/** Merge realtime-inserted points into a loaded route (dedupe on seq, keep order). */
export function mergePoints(current: TripPoint[], incoming: TripPoint[]): TripPoint[] {
  const bySeq = new Map(current.map((point) => [point.seq, point]));
  for (const point of incoming) bySeq.set(point.seq, point);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

export async function fetchTripEvents(id: string): Promise<TripEvent[]> {
  const db = client();
  if (!db) return demoEvents(id);
  const { data, error } = await db
    .from('trip_events')
    .select('*')
    .eq('trip_id', id)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as TripEvent[] | null) ?? [];
}

/** admin_review_trip RPC (docs/06). The server enforces admin + note; the client check only avoids a round trip. */
export async function reviewTrip(id: string, approve: boolean, note: string): Promise<void> {
  if (!note.trim()) throw new Error('NOTE_REQUIRED');
  const db = client();
  if (!db) return;
  const { error } = await db.rpc('admin_review_trip', {
    p_trip_id: id,
    p_approve: approve,
    p_note: note.trim(),
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const db = client();
  if (!db) return;
  const { error } = await db.auth.signOut();
  if (error) throw error;
}

export type DriverProfile = {
  name: string;
  phone: string;
  language: string;
  stats: DriverStats;
  active: boolean;
};

const emptyStats: DriverStats = {
  verified_trips: 0,
  verified_distance_m: 0,
  first_verified_at: null,
  last_verified_at: null,
};

export async function fetchDriverProfile(): Promise<DriverProfile> {
  const db = client();
  if (!db) return demoProfile();
  const { data: userData, error: userError } = await db.auth.getUser();
  if (userError) throw userError;
  const id = userData.user?.id;
  if (!id) throw new Error('FORBIDDEN');
  const [profile, stats, active] = await Promise.all([
    db.from('profiles').select('full_name, phone, preferred_language').eq('id', id).maybeSingle(),
    db.from('driver_stats').select('*').eq('driver_id', id).maybeSingle(),
    db.from('trips').select('id').eq('driver_id', id).eq('status', 'in_progress').maybeSingle(),
  ]);
  for (const result of [profile, stats, active]) if (result.error) throw result.error;
  return {
    name: stringValue(profile.data?.full_name),
    phone: stringValue(profile.data?.phone),
    language: stringValue(profile.data?.preferred_language, 'en'),
    stats: (stats.data as DriverStats | null) ?? emptyStats,
    active: Boolean(active.data),
  };
}

type Unsubscribe = () => void;

/**
 * Realtime subscription with resubscribe on channel error/timeout. `onReconnect` fires
 * on every (re)SUBSCRIBED so callers refetch anything missed while disconnected (docs/06 §3).
 */
export function subscribe(
  table: string,
  filter: string | undefined,
  onChange: (row: Row | null) => void,
  onReconnect?: () => void,
): Unsubscribe {
  if (!supabase) return () => undefined;
  const db = supabase;
  const name = `m11-${table}-${filter ?? 'all'}`;
  let stopped = false;
  let channel: ReturnType<typeof db.channel> | null = null;

  const connect = () => {
    channel = db
      .channel(name)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        (payload) => onChange((payload.new as Row | undefined) ?? null),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') onReconnect?.();
        if (!stopped && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) {
          const dead = channel;
          channel = null;
          void (dead ? db.removeChannel(dead) : Promise.resolve()).then(() => {
            if (!stopped) connect();
          });
        }
      });
  };
  connect();
  return () => {
    stopped = true;
    if (channel) void db.removeChannel(channel);
  };
}
