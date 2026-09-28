/**
 * The driver's own profile row (M11, D8).
 *
 * `useProfile` gives the routing gate the slice it needs (role, active, name).
 * D8 needs two more columns — the phone to show masked, and `created_at` for
 * "Driver since" — so this is a separate read of the same row rather than
 * widening the gate's type with fields three other screens would carry around.
 *
 * RLS (`profiles_self`) limits it to the signed-in driver's own row.
 */
import { useQuery } from "@tanstack/react-query";

import { useAuthStore } from "@/features/auth/store";
import type { Tables } from "@/lib/database.types";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type ProfileRow = Tables<"profiles">;

export type OwnProfile = {
  fullName: string;
  phone: string | null;
  preferredLanguage: string;
  createdAt: string;
};

export const OWN_PROFILE_QUERY_KEY = ["driver", "own-profile"] as const;

export function useOwnProfile() {
  const userId = useAuthStore((state) => state.userId);

  return useQuery({
    queryKey: [...OWN_PROFILE_QUERY_KEY, userId],
    enabled: userId !== null && isSupabaseConfigured,
    queryFn: async (): Promise<OwnProfile | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, phone, preferred_language, created_at")
        .eq("id", userId ?? "")
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }
      if (data === null) {
        return null;
      }
      const row = data as Pick<
        ProfileRow,
        "full_name" | "phone" | "preferred_language" | "created_at"
      >;
      return {
        fullName: row.full_name,
        phone: row.phone,
        // The column has a default, but a row written before it existed can
        // still be null; the app's default is the honest fallback.
        preferredLanguage: row.preferred_language ?? "en",
        createdAt: row.created_at,
      };
    },
    staleTime: 5 * 60_000,
  });
}
