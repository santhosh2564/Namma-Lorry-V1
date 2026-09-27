/**
 * `admin-create-driver` Edge Function (M6).
 *
 * Wiring only — the behaviour lives in `driver.ts`. This is the single place in
 * the repository that reads `SUPABASE_SERVICE_ROLE_KEY`; the console calls it
 * with the admin's own JWT and never sees the key (docs/07 §4, hard rule 6).
 */
import { createClient } from "npm:@supabase/supabase-js@2";

import { CORS_HEADERS, type CreateDriverDeps, handleCreateDriver } from "./driver.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/** The service-role client bypasses RLS, so it is built once and kept here. */
const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const anon = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * A client that acts as the *caller* rather than as the service role, so
 * `is_admin()` runs under the caller's own identity and Postgres — not this
 * function — decides the answer.
 */
function asCaller(jwt: string) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

const deps: CreateDriverDeps = {
  getUser: async (jwt: string) => {
    const { data, error } = await anon.auth.getUser(jwt);
    if (error || data.user === null) {
      return null;
    }
    return { id: data.user.id };
  },

  isAdmin: async (jwt: string) => {
    const { data, error } = await asCaller(jwt).rpc("is_admin");
    return !error && data === true;
  },

  serviceRole: {
    createAuthUser: async ({ phone }) => {
      const { data, error } = await serviceClient.auth.admin.createUser({
        phone,
        // The number is confirmed by the OTP the driver enters on first
        // sign-in, so nothing is pre-confirmed here.
        phone_confirm: false,
      });
      if (error) {
        return { error: { message: error.message } };
      }
      if (data.user === null) {
        return { error: { message: "no user returned" } };
      }
      return { id: data.user.id };
    },

    updateProfile: async (userId, patch) => {
      const { error } = await serviceClient
        .from("profiles")
        .update({ full_name: patch.full_name, role: patch.role, phone: patch.phone })
        .eq("id", userId);
      return { error: error === null ? null : { message: error.message } };
    },
  },
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return handleCreateDriver(req, deps);
});
