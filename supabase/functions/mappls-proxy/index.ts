/**
 * `mappls-proxy` Edge Function (M6, docs/06 §4).
 *
 * Wiring only: the behaviour lives in `proxy.ts`, which takes every dependency
 * as an argument so it can be tested without Supabase or a network.
 *
 * Two secrets are read from `supabase secrets` and never from the client:
 *   MAPPLS_REST_KEY      the current (Aug 2025+) static key
 *   MAPPLS_CLIENT_ID /
 *   MAPPLS_CLIENT_SECRET  the pre-Aug-2025 OAuth client, still honoured
 * See README.md for how the auth model was researched.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

import { CORS_HEADERS, type ProxyDeps, handleProxy } from "./proxy.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const deps: ProxyDeps = {
  fetchImpl: (...args) => fetch(...args),
  now: () => Date.now(),
  getAccessToken: () =>
    Deno.env.get("MAPPLS_REST_KEY") ??
      Deno.env.get("MAPPLS_CLIENT_SECRET") ??
      "",

  /**
   * Verifies the caller's JWT with Supabase (not by decoding it ourselves) and
   * then asks the database whether that user is an active admin. Both steps
   * matter: the first proves the token is real, the second makes Postgres the
   * only authority on the role (docs/06 §4, hard rule 2).
   */
  getUser: async (jwt: string) => {
    if (SUPABASE_URL === "" || ANON_KEY === "") {
      return null;
    }
    const { data, error } = await createClient(SUPABASE_URL, ANON_KEY).auth.getUser(jwt);
    if (error || data.user === null) {
      return null;
    }
    return { id: data.user.id };
  },

  isAdmin: async (jwt: string) => {
    if (SUPABASE_URL === "" || ANON_KEY === "") {
      return false;
    }
    const { data, error } = await createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    }).rpc("is_admin");

    return !error && data === true;
  },
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return handleProxy(req, { deps });
});
