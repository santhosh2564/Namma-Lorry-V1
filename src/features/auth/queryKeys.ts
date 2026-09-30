/**
 * The profile query's key, in a module of its own so screens that only need to
 * invalidate it (D1 after a consent) don't import the Supabase client.
 */
export const PROFILE_QUERY_KEY = ["auth", "profile"] as const;
