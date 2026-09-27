/**
 * Vehicles data (M6, doc 12 C9).
 *
 * A vehicle is an ordinary table with admin-only RLS, so unlike a driver it can
 * be created from the console with a plain insert — no service role, no Edge
 * Function. `owner_id` stays null on purpose: ND-19 hides the owner picker
 * until an admin can create owner and shipper profiles at all.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { AddVehicleValues, VehicleType } from "@/features/vehicles/schemas";
import type { Tables } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

type VehicleRow = Tables<"vehicles">;

export type VehicleListRow = {
  id: string;
  registrationNo: string;
  vehicleType: string;
  /** Null while ND-19 keeps the owner picker hidden. */
  ownerName: string | null;
  createdAt: string;
};

export const VEHICLES_QUERY_KEY = ["console", "vehicles"] as const;

function throwUnlessOk(error: { message: string } | null): void {
  if (error) {
    throw new Error(error.message);
  }
}

export function useVehicles() {
  return useQuery({
    queryKey: VEHICLES_QUERY_KEY,
    queryFn: async (): Promise<VehicleListRow[]> => {
      const { data, error } = await supabase.from("vehicles").select("*").order("registration_no");

      throwUnlessOk(error);

      // Owner names need a second read rather than a nested select; see the
      // note in src/features/drivers/useDrivers.ts about reverse relationships.
      const ownerIds = (data ?? [])
        .map((row) => row.owner_id)
        .filter((id): id is string => id !== null);

      const owners = new Map<string, string>();
      if (ownerIds.length > 0) {
        const { data: profiles, error: ownerError } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", ownerIds);

        throwUnlessOk(ownerError);
        for (const profile of profiles ?? []) {
          owners.set(profile.id, profile.full_name);
        }
      }

      return (data ?? []).map((row: VehicleRow) => ({
        id: row.id,
        registrationNo: row.registration_no,
        vehicleType: row.vehicle_type,
        ownerName: row.owner_id === null ? null : (owners.get(row.owner_id) ?? null),
        createdAt: row.created_at,
      }));
    },
    staleTime: 30_000,
  });
}

export function useCreateVehicle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: AddVehicleValues) => {
      const { data, error } = await supabase
        .from("vehicles")
        .insert({
          registration_no: values.registrationNo,
          vehicle_type: values.vehicleType as VehicleType,
        })
        .select()
        .single();

      throwUnlessOk(error);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: VEHICLES_QUERY_KEY });
    },
  });
}
