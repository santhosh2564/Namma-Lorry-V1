/**
 * Profile query (M5).
 *
 * The profile is server state, so it is a TanStack Query rather than a store
 * field: one owner, cached, and re-fetched when the session changes. The RLS
 * policy on `profiles` lets a user read their own row and nothing else, so this
 * is all the identity the client ever learns (docs/09 §2).
 */
import { useQuery } from "@tanstack/react-query";

import type { AuthProfile } from "@/features/auth/routing";
import { useAuthStore } from "@/features/auth/store";
import type { Tables } from "@/lib/database.types";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type ProfileRow = Tables<"profiles">;

const PROFILE_QUERY_KEY = ["auth", "profile"] as const;

/**
 * Map a `profiles` row onto the shape the gate reads.
 *
 * `permissionsGranted` is hard-coded true for now: the real check belongs to
 * the permission screen that M9 builds, and guessing at it here would send
 * drivers straight into a trip they cannot record. M9 replaces this line.
 */
export function toAuthProfile(row: ProfileRow): AuthProfile {
  return {
    id: row.id,
    role: row.role,
    isActive: row.is_active,
    fullName: row.full_name,
    permissionsGranted: true,
  };
}

export function useProfile() {
  const userId = useAuthStore((state) => state.userId);

  return useQuery({
    queryKey: [...PROFILE_QUERY_KEY, userId],
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

      return data === null ? null : toAuthProfile(data);
    },
    enabled: userId !== null,
    // The role and activation flag change rarely; five minutes keeps the gate
    // off the network on every cold start.
    staleTime: 5 * 60_000,
    retry: 1,
  });
}
