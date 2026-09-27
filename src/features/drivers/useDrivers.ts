/**
 * Drivers data (M6, doc 12 C8).
 *
 * Three reads and a join rather than one nested PostgREST select: the generated
 * `Database` types carry each table's own foreign keys but not the reverse
 * relationships, so `profiles?select=...,trips(...)` would not type-check even
 * though the database supports it. The join happens here instead, and it keeps
 * the exact columns the table needs.
 *
 * Every read is under the admin-only RLS policies, so a non-admin gets an empty
 * result rather than somebody else's fleet.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { AddDriverValues } from "@/features/drivers/schemas";
import type { Tables } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

type ProfileRow = Tables<"profiles">;
type StatsRow = Tables<"driver_stats">;
type TripRow = Tables<"trips">;

/** One row of the C8 table, already joined and formatted for display. */
export type DriverRow = {
  id: string;
  fullName: string;
  phone: string;
  isActive: boolean;
  /** Missing `driver_stats` means no verified trip yet, not an error. */
  verifiedTrips: number;
  verifiedKm: number;
  /** ISO date of the most recent trip of any status, or null. */
  lastTripAt: string | null;
  lastTripStatus: TripRow["status"] | null;
};

export const DRIVERS_QUERY_KEY = ["console", "drivers"] as const;

/** The review-queue badge on the sidebar (C7), counted server-side. */
export const REVIEW_QUEUE_COUNT_KEY = ["console", "review-count"] as const;

function throwUnlessOk(error: { message: string } | null): void {
  if (error) {
    throw new Error(error.message);
  }
}

export function useDrivers() {
  return useQuery({
    queryKey: DRIVERS_QUERY_KEY,
    queryFn: async (): Promise<DriverRow[]> => {
      const [profiles, stats, trips] = await Promise.all([
        supabase.from("profiles").select("*").eq("role", "driver").order("full_name"),
        supabase.from("driver_stats").select("*"),
        supabase
          .from("trips")
          .select("driver_id, status, started_at, created_at")
          .order("created_at", { ascending: false }),
      ]);

      throwUnlessOk(profiles.error);
      throwUnlessOk(stats.error);
      throwUnlessOk(trips.error);

      const statsByDriver = new Map<string, StatsRow>(
        (stats.data ?? []).map((row) => [row.driver_id, row]),
      );

      // First trip per driver wins, because the query is ordered newest first.
      const lastTripByDriver = new Map<string, TripRow>();
      for (const trip of trips.data ?? []) {
        if (!lastTripByDriver.has(trip.driver_id)) {
          lastTripByDriver.set(trip.driver_id, trip as TripRow);
        }
      }

      return (profiles.data as ProfileRow[]).map((profile) => {
        const stat = statsByDriver.get(profile.id);
        const lastTrip = lastTripByDriver.get(profile.id);
        return {
          id: profile.id,
          fullName: profile.full_name,
          phone: profile.phone ?? "",
          isActive: profile.is_active,
          verifiedTrips: stat?.verified_trips ?? 0,
          verifiedKm: Math.round((stat?.verified_distance_m ?? 0) / 1000),
          lastTripAt: lastTrip?.started_at ?? lastTrip?.created_at ?? null,
          lastTripStatus: lastTrip?.status ?? null,
        };
      });
    },
    staleTime: 30_000,
  });
}

export function useReviewQueueCount() {
  return useQuery({
    queryKey: REVIEW_QUEUE_COUNT_KEY,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("trips")
        .select("id", { count: "exact", head: true })
        .eq("status", "needs_review");

      throwUnlessOk(error);
      return count ?? 0;
    },
    // The badge is a nudge, not a number anyone acts on; polling is enough.
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/**
 * Registering a driver is the one console action that cannot be a plain
 * insert: `auth.users` is not writable through RLS, so it goes through the
 * `admin-create-driver` Edge Function, which checks the caller is an admin
 * before it touches the service role. There is deliberately no client-side
 * fallback — a half-registered driver cannot receive an OTP.
 */
export function useCreateDriver() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: AddDriverValues) => {
      const { data, error } = await supabase.functions.invoke<{
        id: string;
        fullName: string;
        phone: string;
        error?: { code: string; message: string };
      }>("admin-create-driver", {
        body: { fullName: values.fullName, phone: values.phone },
      });

      if (error) {
        throw new Error(error.message);
      }
      if (data?.error) {
        throw new Error(data.error.message);
      }
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DRIVERS_QUERY_KEY });
    },
  });
}
