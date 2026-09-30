/**
 * Profile query (M5).
 *
 * The profile is server state, so it is a TanStack Query rather than a store
 * field: one owner, cached, and re-fetched when the session changes. The RLS
 * policy on `profiles` lets a user read their own row and nothing else, so this
 * is all the identity the client ever learns (docs/09 §2).
 */
import { useQuery } from "@tanstack/react-query";

import { PROFILE_QUERY_KEY } from "@/features/auth/queryKeys";
import type { AuthProfile } from "@/features/auth/routing";
import { useAuthStore } from "@/features/auth/store";
import type { Tables } from "@/lib/database.types";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type ProfileRow = Tables<"profiles">;

/**
 * Map a `profiles` row onto the shape the gate reads.
 *
 * `permissionsGranted` comes from the OS (M9), not the profile row: the launch
 * bootstrap reads it into the store before the gate runs, and D1 keeps it
 * fresh, so a driver whose background grant vanished routes back to onboarding
 * (docs/12 D1) instead of into a trip they cannot record.
 */
export function toAuthProfile(row: ProfileRow, permissionsGranted: boolean): AuthProfile {
  return {
    id: row.id,
    role: row.role,
    isActive: row.is_active,
    fullName: row.full_name,
    permissionsGranted,
    // The policy version the driver agreed to; the launch gate re-prompts when
    // it is not the one this build was compiled with (0009, docs/09 §1).
    consentVersion: row.consent_version,
  };
}

export function useProfile() {
  const userId = useAuthStore((state) => state.userId);
  // In the query key so a permission change re-resolves the gate's profile
  // without a network round trip being involved.
  const permissionsGranted = useAuthStore((state) => state.permissionsGranted);

  return useQuery({
    queryKey: [...PROFILE_QUERY_KEY, userId, permissionsGranted],
    // Null means "the session has no profile row", which the gate turns into
    // the S4 "not set up" notice.
    queryFn: async ({ signal }): Promise<AuthProfile | null> => {
      if (userId === null || !isSupabaseConfigured) {
        throw new Error("No signed-in user");
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .abortSignal(signal)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      return data === null ? null : toAuthProfile(data, permissionsGranted ?? true);
    },
    enabled: userId !== null,
    // The role and activation flag change rarely; five minutes keeps the gate
    // off the network on every cold start.
    staleTime: 5 * 60_000,
    retry: 1,
  });
}
