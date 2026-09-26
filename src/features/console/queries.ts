import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AddDriverValues } from '@/features/drivers/schemas';
import type { AddVehicleValues } from '@/features/vehicles/schemas';
import { invokeFunction } from '@/lib/functions';
import { supabase } from '@/lib/supabase';

import { buildDriverRows, buildVehicleRows, type TripActivity } from './consoleData';

export const consoleKeys = {
  drivers: ['console', 'drivers'] as const,
  vehicles: ['console', 'vehicles'] as const,
  reviewCount: ['console', 'review-count'] as const,
};

/**
 * Trip activity for status / last-trip / usage columns. Phase 1 volumes are small
 * (tens of drivers), so this reads the latest 5,000 trips; move to a view if that grows.
 */
async function fetchTripActivity(): Promise<TripActivity[]> {
  const { data, error } = await supabase
    .from('trips')
    .select('driver_id, vehicle_id, status, started_at, ended_at')
    .order('created_at', { ascending: false })
    .limit(5000);
  if (error) throw error;
  return data;
}

export function useDriverRows() {
  return useQuery({
    queryKey: consoleKeys.drivers,
    queryFn: async () => {
      const [profiles, stats, trips] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, phone, is_active')
          .eq('role', 'driver')
          .order('full_name'),
        supabase.from('driver_stats').select('driver_id, verified_trips, verified_distance_m'),
        fetchTripActivity(),
      ]);
      if (profiles.error) throw profiles.error;
      if (stats.error) throw stats.error;
      return buildDriverRows(profiles.data, stats.data, trips);
    },
  });
}

export function useVehicleRows() {
  return useQuery({
    queryKey: consoleKeys.vehicles,
    queryFn: async () => {
      const [vehicles, trips] = await Promise.all([
        supabase
          .from('vehicles')
          .select('id, registration_no, vehicle_type, owner:profiles!vehicles_owner_id_fkey(full_name)')
          .order('registration_no'),
        fetchTripActivity(),
      ]);
      if (vehicles.error) throw vehicles.error;
      return buildVehicleRows(vehicles.data, trips);
    },
  });
}

/** Sidebar badge: trips waiting for an admin decision. */
export function useReviewCount() {
  return useQuery({
    queryKey: consoleKeys.reviewCount,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('trips')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'needs_review');
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });
}

/** Creates the auth user + profile through the admin-create-driver Edge Function. */
export function useCreateDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: AddDriverValues) =>
      invokeFunction<{ driver: { id: string } }>('admin-create-driver', {
        fullName: v.fullName,
        phone: v.phone,
        preferredLanguage: v.preferredLanguage,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: consoleKeys.drivers }),
  });
}

export class DuplicateVehicleError extends Error {}

export function useAddVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: AddVehicleValues) => {
      const { error } = await supabase
        .from('vehicles')
        .insert({ registration_no: v.registrationNo, vehicle_type: v.vehicleType });
      if (error?.code === '23505') throw new DuplicateVehicleError(v.registrationNo);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: consoleKeys.vehicles }),
  });
}
