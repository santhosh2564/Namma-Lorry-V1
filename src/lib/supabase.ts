import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { config, type AppConfig } from "@/lib/config";
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

// Development only: an unconfigured dev build gets a placeholder so the auth
// bootstrap reads "nobody is signed in" and S2 says sign-in is unavailable,
// instead of throwing while the module is imported and blanking the splash
// (M5). Staging and production never get it (validation M2).
const PLACEHOLDER_URL = "http://127.0.0.1:54321";
const PLACEHOLDER_KEY = "supabase-anon-key-not-configured";

/**
 * Where the client connects, or `null` when it must not be created at all.
 * Pure and exported so the no-localhost rule is testable per environment.
 */
export function supabaseCredentials(
  cfg: Pick<AppConfig, "appEnv" | "supabaseUrl" | "supabaseAnonKey">,
): { url: string; key: string } | null {
  if (isConfigured(cfg.supabaseUrl, cfg.supabaseAnonKey)) {
    return { url: cfg.supabaseUrl, key: cfg.supabaseAnonKey };
  }
  if (cfg.appEnv !== "development") {
    return null;
  }
  return { url: PLACEHOLDER_URL, key: PLACEHOLDER_KEY };
}

const credentials = supabaseCredentials(config);

if (credentials?.url === PLACEHOLDER_URL) {
  console.error(
    "Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and " +
      "EXPO_PUBLIC_SUPABASE_ANON_KEY in .env — see docs/DEV_SETUP.md.",
  );
}

/**
 * Stands in for the client in a misconfigured staging or production build.
 * The root layout shows the Misconfigured screen before any screen mounts, so
 * nothing should reach this; if something does, it fails loudly here rather
 * than sending a request to a guessed backend. `then` stays undefined so the
 * object is never mistaken for a promise.
 */
function notConfiguredClient(): SupabaseClient<Database> {
  return new Proxy({} as SupabaseClient<Database>, {
    get(_target, property) {
      if (property === "then" || typeof property === "symbol") {
        return undefined;
      }
      throw new Error(
        `Supabase is not configured for ${config.appEnv} (supabase.${property}); ` +
          "the build is missing a valid EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY.",
      );
    },
  });
}

/**
 * The single Supabase client for the app. Typed with `Database`, so
 * `from("trips")` only accepts the real columns and `rpc("start_trip", …)`
 * only the real arguments — a typo is a compile error, not a runtime one.
 *
 * This client only ever holds the *anon* key. Every table has RLS enabled, so
 * that is what makes the driver's own rows readable and nothing else
 * (docs/09 §2). The service role key never reaches the app.
 */
export const supabase: SupabaseClient<Database> =
  credentials === null
    ? notConfiguredClient()
    : createClient<Database>(credentials.url, credentials.key, {
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
