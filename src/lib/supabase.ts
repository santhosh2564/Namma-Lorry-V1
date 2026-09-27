import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { config } from "@/lib/config";
import type { Database } from "@/lib/database.types";

export type { Database } from "@/lib/database.types";

/**
 * The slice of the Web Storage API that `@supabase/supabase-js` needs for a
 * session. Every method may be sync or async, so both implementations below
 * satisfy it.
 */
export type SessionStorage = {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
};

/**
 * Native (Android/iOS): the session is a bearer token, so it goes in the
 * keychain / keystore rather than AsyncStorage (CLAUDE.md hard rule 6, M5).
 *
 * `expo-secure-store` ships an empty object on web, so this branch must only
 * ever be selected on a native platform — hence the `Platform.OS` check below
 * rather than a platform-split file.
 */
export const secureStoreSessionStorage: SessionStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

/**
 * `localStorage` reached defensively. It is missing entirely during static
 * rendering, merely *touching* it throws in some private-browsing modes, and
 * writing to it throws once the origin quota is full. A session we cannot
 * persist only costs the user one extra sign-in, so every one of those
 * failures degrades to "not remembered" instead of taking the app down.
 */
function browserLocalStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function readLocalStorage(key: string): string | null {
  try {
    return browserLocalStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeLocalStorage(key: string, value: string): void {
  try {
    browserLocalStorage()?.setItem(key, value);
  } catch {
    // Out of quota, or storage disabled for this origin.
  }
}

function deleteLocalStorage(key: string): void {
  try {
    browserLocalStorage()?.removeItem(key);
  } catch {
    // Nothing to do: the value is unreachable either way.
  }
}

export const webSessionStorage: SessionStorage = {
  getItem: readLocalStorage,
  setItem: writeLocalStorage,
  removeItem: deleteLocalStorage,
};

/** The storage the client below is wired to on this platform. */
export const sessionStorage: SessionStorage =
  Platform.OS === "web" ? webSessionStorage : secureStoreSessionStorage;

/**
 * Whether this build has both halves of a Supabase connection.
 *
 * Pure and exported so the gate can be tested on both sides of the transition
 * without depending on the ambient environment: a developer with real
 * credentials in `.env.local` and CI with none must be able to assert the same
 * decision.
 */
export function isConfigured(url: string, key: string): boolean {
  return url !== "" && key !== "";
}

export const isSupabaseConfigured = isConfigured(config.supabaseUrl, config.supabaseAnonKey);

// Only used when the app is misconfigured, so that a bad release surfaces in
// Sentry as a network error instead of a white screen on the splash route.
const PLACEHOLDER_URL = "http://127.0.0.1:54321";
const PLACEHOLDER_KEY = "supabase-anon-key-not-configured";

function credentials(): { url: string; key: string } {
  if (isSupabaseConfigured) {
    return { url: config.supabaseUrl, key: config.supabaseAnonKey };
  }

  // Loud in development, but not fatal: the auth bootstrap treats a missing
  // backend as "nobody is signed in" and S2 says sign-in is unavailable, which
  // is a far better failure than throwing while the module is being imported
  // and blanking the splash (M5).
  console.error(
    "Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and " +
      "EXPO_PUBLIC_SUPABASE_ANON_KEY in .env — see docs/DEV_SETUP.md.",
  );
  return { url: PLACEHOLDER_URL, key: PLACEHOLDER_KEY };
}

const { url, key } = credentials();

/**
 * The single Supabase client for the app. Typed with `Database`, so
 * `from("trips")` only accepts the real columns and `rpc("start_trip", …)`
 * only the real arguments — a typo is a compile error, not a runtime one.
 *
 * This client only ever holds the *anon* key. Every table has RLS enabled, so
 * that is what makes the driver's own rows readable and nothing else
 * (docs/09 §2). The service role key never reaches the app.
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(url, key, {
  auth: {
    storage: sessionStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Web returns from an auth redirect with the tokens in the URL, so the
    // session has to be picked up from there. Native never redirects.
    detectSessionInUrl: Platform.OS === "web",
  },
  global: {
    headers: { "X-Client-Info": `namma-lorry/${config.appEnv}` },
  },
});
