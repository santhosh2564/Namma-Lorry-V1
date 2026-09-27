/**
 * E2E helpers for the console specs (M7).
 *
 * The app only offers phone-OTP sign-in, which a browser test cannot complete:
 * there is no SMS in CI. So the spec creates (or reuses) an admin with a known
 * password using the service-role key, signs in through Supabase's own REST
 * endpoint, and injects the resulting session into localStorage before the app
 * boots. The app's sign-in form is M5's, untouched; this is a test seam, and
 * the keys it needs are server-side only.
 */
import type { Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../src/lib/database.types";

export type E2EConfig = {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  adminEmail: string;
  adminPassword: string;
};

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Supabase-js stores the session under `sb-<project-ref>-auth-token`. */
export function sessionStorageKey(supabaseUrl: string): string {
  const ref = new URL(supabaseUrl).hostname.split(".")[0] ?? "project";
  return `sb-${ref}-auth-token`;
}

/**
 * Reads the E2E configuration from the environment.
 *
 * Returns null — and the caller skips — unless everything is present, because a
 * half-configured run that fails is worse than one that reports it cannot run.
 */
export function readConfig(): E2EConfig | null {
  const supabaseUrl = process.env.E2E_SUPABASE_URL;
  const anonKey = process.env.E2E_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.E2E_SERVICE_ROLE_KEY;
  const adminEmail = process.env.E2E_ADMIN_EMAIL;
  const adminPassword = process.env.E2E_ADMIN_PASSWORD;

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !adminEmail || !adminPassword) {
    return null;
  }
  return { supabaseUrl, anonKey, serviceRoleKey, adminEmail, adminPassword };
}

export function missingEnvKeys(): string[] {
  return [
    "E2E_SUPABASE_URL",
    "E2E_SUPABASE_ANON_KEY",
    "E2E_SERVICE_ROLE_KEY",
    "E2E_ADMIN_EMAIL",
    "E2E_ADMIN_PASSWORD",
  ].filter((key) => process.env[key] === undefined || process.env[key] === "");
}

/**
 * Makes sure an active admin exists and returns a session for it.
 *
 * The account is created with the service role and the `profiles` row is
 * promoted to admin directly, because the console's own "add a driver" path is
 * phone-only and a test must not depend on the thing it is testing.
 */
export async function signInAsAdmin(config: E2EConfig): Promise<string> {
  const admin = createClient<Database>(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: config.adminEmail,
    password: config.adminPassword,
    email_confirm: true,
  });

  if (createError && !/already been registered|already exists/i.test(createError.message)) {
    throw new Error(`Could not create the E2E admin: ${createError.message}`);
  }

  const userId = created?.user?.id ?? (await findUserIdByEmail(admin, config.adminEmail));
  if (userId === null) {
    throw new Error("E2E admin exists but could not be resolved to a user id");
  }

  // `is_admin()` reads the profile, not the JWT claims, so the role has to be
  // set in the database before the app asks for it.
  const { error: promoteError } = await admin
    .from("profiles")
    .update({ role: "admin", is_active: true })
    .eq("id", userId);
  if (promoteError) {
    throw new Error(`Could not promote the E2E admin: ${promoteError.message}`);
  }

  const anon = createClient<Database>(config.supabaseUrl, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: session, error: signInError } = await anon.auth.signInWithPassword({
    email: config.adminEmail,
    password: config.adminPassword,
  });
  if (signInError || session.session === null) {
    throw new Error(`Could not sign in as the E2E admin: ${signInError?.message ?? "no session"}`);
  }

  return JSON.stringify(session.session);
}

async function findUserIdByEmail(
  client: SupabaseClient<Database>,
  email: string,
): Promise<string | null> {
  // Paginated in two pages because the default list is 50 users and a shared
  // test project may have more.
  for (let page = 1; page <= 4; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw new Error(`Could not list users: ${error.message}`);
    }
    const match = data.users.find((user) => user.email === email);
    if (match) {
      return match.id;
    }
    if (data.users.length === 0) {
      break;
    }
  }
  return null;
}

/**
 * Puts the session in place before the app's first render.
 *
 * `addInitScript` runs in the page before any of the app's own scripts, so the
 * splash's `getSession` finds the admin already signed in instead of bouncing
 * to the OTP screen.
 */
export async function installSession(
  page: Page,
  config: E2EConfig,
  session: string,
): Promise<void> {
  const key = sessionStorageKey(config.supabaseUrl);
  await page.addInitScript(
    ([storageKey, value]) => {
      window.localStorage.setItem(storageKey as string, value as string);
    },
    [key, session] as const,
  );
}

/** A driver and a vehicle to assign, created idempotently. */
export async function ensureAssignableFixtures(
  config: E2EConfig,
): Promise<{ driverId: string; driverName: string; vehicleId: string; registrationNo: string }> {
  const admin = createClient<Database>(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const driverEmail = `e2e-driver-${Date.now()}@nammalorry.test`;
  const { data: driverUser, error: driverError } = await admin.auth.admin.createUser({
    email: driverEmail,
    email_confirm: true,
    phone: `+9198${String(Date.now()).slice(-8)}`,
  });
  if (driverError || driverUser.user === null) {
    throw new Error(`Could not create the E2E driver: ${driverError?.message ?? "no user"}`);
  }

  const driverId = driverUser.user.id;
  const driverName = `E2E Driver ${driverId.slice(0, 4)}`;
  // The auth trigger creates the profile row with role `driver`; the name is
  // all the console shows.
  const { error: nameError } = await admin
    .from("profiles")
    .update({ full_name: driverName, role: "driver", is_active: true })
    .eq("id", driverId);
  if (nameError) {
    throw new Error(`Could not name the E2E driver: ${nameError.message}`);
  }

  const registrationNo = `TN 09 E2E ${String(Date.now()).slice(-4)}`;
  const { data: vehicle, error: vehicleError } = await admin
    .from("vehicles")
    .insert({ registration_no: registrationNo, vehicle_type: "19ft" })
    .select("id")
    .single();
  if (vehicleError || vehicle === null) {
    throw new Error(`Could not create the E2E vehicle: ${vehicleError?.message ?? "no row"}`);
  }

  return { driverId, driverName, vehicleId: vehicle.id, registrationNo };
}

/** `NL-2026-000142` — the load code the database generates. */
export function isLoadCode(value: string): boolean {
  return /^NL-\d{4}-\d{6}$/.test(value.trim());
}

export { UUID_V4 };
