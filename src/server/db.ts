/**
 * Neon Postgres access — SERVER-ONLY (see ./config.ts for the boundary).
 *
 * Uses `@neondatabase/serverless`'s HTTP driver (`neon(...)`), which talks to
 * Neon over fetch rather than a raw TCP socket — the only kind of Postgres
 * connection a Cloudflare Pages Function can make. `DATABASE_URL` never
 * leaves this module: callers get a tagged-template query function back, not
 * the connection string.
 *
 * Nothing in this repo queries Neon yet (docs/PHASE1_TASKS.md 2026-10-04):
 * the schema, the RLS-equivalent authorization and the 20 Supabase migrations
 * all still live on Postgres-via-Supabase. This client exists so a Pages
 * Function can be added and tested against Neon without first deciding how
 * every `start_trip`-style rule gets reimplemented.
 */
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

import { getDatabaseConfig, type ServerEnv } from "./config";

export type SqlQuery = NeonQueryFunction<false, false>;

/** One query function per request; Neon's HTTP driver holds no socket to pool. */
export function createDatabaseClient(env: ServerEnv): SqlQuery {
  const { databaseUrl } = getDatabaseConfig(env);
  return neon(databaseUrl);
}
