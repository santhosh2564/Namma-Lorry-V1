import { supabase } from '@/lib/supabase';

import type { DriverStats, LiveTrip, Trip, TripEvent, TripPoint } from './types';

type Row = Record<string, unknown>;

const stringValue = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);
const numberValue = (value: unknown, fallback = 0) => (typeof value === 'number' ? value : fallback);
const stringArray = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);

const fallbackTrips: Trip[] = [
  {
    id: 'demo-trip-1', load_id: 'demo-load-1', load_code: 'NL-2026-000021',
    pickup_address: 'Peenya Industrial Area', drop_address: 'Hosur Road, Bengaluru',
    pickup_lat: 13.032, pickup_lng: 77.527, drop_lat: 12.91, drop_lng: 77.64,
    planned_distance_m: 28600, driver_id: 'demo-driver-1', driver_name: 'Arun Kumar', status: 'in_progress',
    started_at: new Date(Date.now() - 48 * 60 * 1000).toISOString(), ended_at: null, tracked_distance_m: null,
    verification_reasons: [], verification_metrics: null, review_note: null,
  },
  {
    id: 'demo-trip-2', load_id: 'demo-load-2', load_code: 'NL-2026-000019',
    pickup_address: 'Whitefield', drop_address: 'Electronic City', pickup_lat: 12.9698, pickup_lng: 77.75,
    drop_lat: 12.845, drop_lng: 77.66, planned_distance_m: 22400, driver_id: 'demo-driver-2', driver_name: 'Shivanna R',
    status: 'needs_review', started_at: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    ended_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), tracked_distance_m: 17900,
    verification_reasons: ['END_OUTSIDE_DROP', 'TRACKING_GAP'], verification_metrics: { points: 128, avg_kmh: 42.8, max_gap_s: 1020 }, review_note: null,
  },
];

const fallbackPoints = (trip: Trip): TripPoint[] => Array.from({ length: 18 }, (_, index) => ({
  trip_id: trip.id, seq: index + 1, recorded_at: new Date(Date.now() - (18 - index) * 3 * 60 * 1000).toISOString(),
  lat: trip.pickup_lat + (trip.drop_lat - trip.pickup_lat) * (index / 17),
  lng: trip.pickup_lng + (trip.drop_lng - trip.pickup_lng) * (index / 17), accuracy_m: 8, speed_mps: 11, heading: 135,
}));

function mapTrip(row: Row): Trip {
  const load = (row.load as Row | null) ?? {};
  const driver = (row.profile as Row | null) ?? {};
  return {
    id: stringValue(row.id), load_id: stringValue(row.load_id), load_code: stringValue(load.load_code, 'Load'),
    pickup_address: stringValue(load.pickup_address, 'Pickup'), drop_address: stringValue(load.drop_address, 'Drop'),
    pickup_lat: numberValue(load.pickup_lat), pickup_lng: numberValue(load.pickup_lng), drop_lat: numberValue(load.drop_lat), drop_lng: numberValue(load.drop_lng),
    planned_distance_m: typeof load.planned_distance_m === 'number' ? load.planned_distance_m : null,
    driver_id: stringValue(row.driver_id), driver_name: stringValue(driver.full_name, 'Driver'), status: stringValue(row.status, 'assigned') as Trip['status'],
    started_at: typeof row.started_at === 'string' ? row.started_at : null, ended_at: typeof row.ended_at === 'string' ? row.ended_at : null,
    tracked_distance_m: typeof row.tracked_distance_m === 'number' ? row.tracked_distance_m : null,
    verification_reasons: stringArray(row.verification_reasons), verification_metrics: (row.verification_metrics as Trip['verification_metrics']) ?? null,
    review_note: typeof row.review_note === 'string' ? row.review_note : null,
  };
}

export async function fetchTrips(status?: string): Promise<Trip[]> {
  if (!supabase) return status ? fallbackTrips.filter((trip) => trip.status === status) : fallbackTrips;
  let query = supabase.from('trips').select('*, load:loads(*), profile:profiles!trips_driver_id_fkey(full_name)').order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error || !data?.length) return status ? fallbackTrips.filter((trip) => trip.status === status) : fallbackTrips;
  return data.map((row) => mapTrip(row as Row));
}

export async function fetchLiveTrips(): Promise<LiveTrip[]> {
  if (!supabase) return fallbackTrips.filter((trip) => trip.status === 'in_progress').map((trip, index) => ({ trip_id: trip.id, driver_id: trip.driver_id, driver_name: trip.driver_name, load_code: trip.load_code, status: 'in_progress', lat: trip.pickup_lat + 0.02 + index * 0.01, lng: trip.pickup_lng + 0.03, speed_mps: 12, heading: 135, recorded_at: new Date(Date.now() - index * 2 * 60 * 1000).toISOString(), updated_at: new Date(Date.now() - index * 2 * 60 * 1000).toISOString() }));
  const { data, error } = await supabase.from('trip_live').select('*, trip:trips!trip_live_trip_id_fkey(status, load:loads(load_code), profile:profiles!trips_driver_id_fkey(full_name))');
  if (error || !data) return [];
  return data.filter((row) => (row.trip as Row | null)?.status === 'in_progress').map((row) => {
    const trip = (row.trip as Row | null) ?? {};
    const load = (trip.load as Row | null) ?? {};
    const profile = (trip.profile as Row | null) ?? {};
    return { trip_id: stringValue(row.trip_id), driver_id: stringValue(row.driver_id), driver_name: stringValue(profile.full_name, 'Driver'), load_code: stringValue(load.load_code, 'Load'), status: 'in_progress', lat: numberValue(row.lat), lng: numberValue(row.lng), speed_mps: typeof row.speed_mps === 'number' ? row.speed_mps : null, heading: typeof row.heading === 'number' ? row.heading : null, recorded_at: stringValue(row.recorded_at), updated_at: stringValue(row.updated_at) };
  });
}

export async function fetchTrip(id: string): Promise<Trip | null> {
  const trips = await fetchTrips();
  return trips.find((trip) => trip.id === id) ?? (supabase ? null : fallbackTrips[0] ?? null);
}

export async function fetchTripPoints(id: string): Promise<TripPoint[]> {
  if (!supabase) return fallbackPoints((fallbackTrips.find((trip) => trip.id === id) ?? fallbackTrips[0])!);
  const pageSize = 1000;
  const pages: TripPoint[] = [];
  for (let page = 0; ; page += 1) {
    const { data, error } = await supabase.from('trip_points').select('*').eq('trip_id', id).order('seq', { ascending: true }).range(page * pageSize, page * pageSize + pageSize - 1);
    if (error || !data) break;
    pages.push(...(data as TripPoint[]));
    if (data.length < pageSize) break;
  }
  return pages;
}

export async function fetchTripEvents(id: string): Promise<TripEvent[]> {
  if (!supabase) return [{ id: 1, trip_id: id, type: 'started', payload: null, created_at: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString() }, { id: 2, trip_id: id, type: 'needs_review', payload: { reasons: ['END_OUTSIDE_DROP'] }, created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() }];
  const { data } = await supabase.from('trip_events').select('*').eq('trip_id', id).order('created_at', { ascending: true });
  return (data as TripEvent[] | null) ?? [];
}

export async function reviewTrip(id: string, approve: boolean, note: string) {
  if (!note.trim()) throw new Error('A review note is required.');
  if (!supabase) return;
  const { error } = await supabase.rpc('admin_review_trip', { p_trip_id: id, p_approve: approve, p_note: note.trim() });
  if (error) throw error;
}

export async function signOut() {
  if (supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }
}

export async function fetchDriverProfile() {
  if (!supabase) return { name: 'Arun Kumar', phone: '+91 98765 43210', language: 'English', stats: { verified_trips: 42, verified_distance_m: 184300, first_verified_at: '2026-01-18', last_verified_at: new Date().toISOString() } satisfies DriverStats, active: true };
  const { data: userData } = await supabase.auth.getUser();
  const id = userData.user?.id;
  if (!id) return { name: 'Driver', phone: '', language: 'English', stats: { verified_trips: 0, verified_distance_m: 0, first_verified_at: null, last_verified_at: null } satisfies DriverStats, active: false };
  const [{ data: profile }, { data: stats }, { data: active }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', id).maybeSingle(), supabase.from('driver_stats').select('*').eq('driver_id', id).maybeSingle(), supabase.from('trips').select('id').eq('driver_id', id).eq('status', 'in_progress').maybeSingle(),
  ]);
  return { name: stringValue(profile?.full_name, 'Driver'), phone: stringValue(profile?.phone), language: stringValue(profile?.preferred_language, 'en'), stats: (stats as DriverStats | null) ?? { verified_trips: 0, verified_distance_m: 0, first_verified_at: null, last_verified_at: null }, active: Boolean(active) };
}

export const subscribe = (table: string, filter: string | undefined, onChange: () => void, onReconnect?: () => void) => {
  if (!supabase) return () => undefined;
  const client = supabase;
  let stopped = false;
  let channel = client.channel(`m11-${table}-${filter ?? 'all'}`);
  const connect = () => {
    channel = client.channel(`m11-${table}-${filter ?? 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, onChange)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') onReconnect?.();
        if (!stopped && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED')) {
          onReconnect?.();
          void client.removeChannel(channel).then(() => { if (!stopped) connect(); });
        }
      });
  };
  connect();
  return () => { stopped = true; void client.removeChannel(channel); };
};
