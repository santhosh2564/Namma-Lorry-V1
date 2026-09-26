// Driver-side trip queries (D3, D4). RLS `trips_driver` / `loads_driver` / `vehicles_driver`
// limit every row to the signed-in driver's own trips.
import { useQuery } from '@tanstack/react-query';

import { useAuthStore } from '@/features/auth/store';
import { supabase } from '@/lib/supabase';

const TRIP_SELECT =
  'id, status, created_at, started_at, load:loads(id, load_code, pickup_address, pickup_lat, pickup_lng, pickup_radius_m, drop_address, drop_lat, drop_lng, drop_radius_m, planned_distance_m, material, weight_kg), vehicle:vehicles(id, registration_no, vehicle_type)';

export const driverTripKeys = {
  mine: (userId: string | undefined) => ['driver', 'trips', userId] as const,
  detail: (id: string) => ['driver', 'trip', id] as const,
};

async function fetchMyTrips(userId: string) {
  const { data, error } = await supabase
    .from('trips')
    .select(TRIP_SELECT)
    .eq('driver_id', userId)
    .in('status', ['assigned', 'in_progress'])
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export type DriverTrip = Awaited<ReturnType<typeof fetchMyTrips>>[number];

/** D3: open trips (assigned + in progress), oldest assignment first. */
export function useMyTrips() {
  const userId = useAuthStore((s) => s.session?.user.id);
  return useQuery({
    queryKey: driverTripKeys.mine(userId),
    enabled: !!userId,
    queryFn: () => fetchMyTrips(userId!),
  });
}

/** D4: one trip with its load and vehicle. */
export function useMyTrip(id: string | undefined) {
  return useQuery({
    queryKey: driverTripKeys.detail(id ?? ''),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('trips').select(TRIP_SELECT).eq('id', id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** "Auto parts · 6.5 t" */
export function cargoText(load: { material: string | null; weight_kg: number | null }): string {
  const weight = load.weight_kg ? `${Number((load.weight_kg / 1000).toFixed(1))} t` : null;
  return [load.material, weight].filter(Boolean).join(' · ') || '—';
}

/** "Hosur SIPCOT, Tamil Nadu" → "Hosur SIPCOT" for compact route lines. */
export function shortPlace(address: string): string {
  return address.split(',')[0]!.trim();
}

const SUMMARY_SELECT =
  'id, status, started_at, ended_at, tracked_distance_m, verification_reasons, verification_metrics, review_note, load:loads(load_code, pickup_address, drop_address)';

export const summaryKeys = {
  trip: (id: string) => ['driver', 'summary', id] as const,
  stats: (userId: string | undefined) => ['driver', 'stats', userId] as const,
};

export async function fetchTripSummary(id: string) {
  const { data, error } = await supabase.from('trips').select(SUMMARY_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export type TripSummaryRow = NonNullable<Awaited<ReturnType<typeof fetchTripSummary>>>;

/** D6 totals: the driver's verified experience (RLS `stats_self`). Written only by verify_trip. */
export function useDriverStats(enabled: boolean) {
  const userId = useAuthStore((s) => s.session?.user.id);
  return useQuery({
    queryKey: summaryKeys.stats(userId),
    enabled: enabled && !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_stats')
        .select('verified_trips, verified_distance_m')
        .eq('driver_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
