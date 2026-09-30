import { z } from "zod";

/**
 * Runtime configuration (M1; fail-closed since validation M2).
 *
 * All public runtime configuration comes from EXPO_PUBLIC_* env vars.
 * Server-only secrets (Mappls client secret, service role key) never appear in
 * this module — they live in Edge Function secrets (CLAUDE.md hard rule 6).
 *
 * - development: a missing backend is tolerated (sign-in says it is
 *   unavailable) and an unknown APP_ENV throws, so nobody builds against a
 *   broken env silently.
 * - staging / production, or a release bundle (`__DEV__` false) without a
 *   valid APP_ENV: a missing, unparsable or http:// Supabase URL, or a missing
 *   key, FAILS CLOSED. `configProblems` lists the offending key names (never
 *   their values), the backend URL and key are empty (never localhost), and
 *   app/_layout.tsx renders the blocking Misconfigured screen.
 */
const appEnvSchema = z.enum(["development", "staging", "production"]);

export type AppEnv = z.infer<typeof appEnvSchema>;

export type ConfigProblem = {
  key: string;
  reason: "missing" | "invalid" | "insecure";
};

export type AppConfig = {
  appEnv: AppEnv;
  supabaseUrl: string;
  supabaseAnonKey: string;
  mapplsMapSdkKey: string;
  androidStoreUrl: string;
  iosStoreUrl: string;
  sentryDsn: string;
  privacyPolicyUrl: string;
};

type RawEnv = Record<string, string | undefined>;

/**
 * The browser-safe key, under either name.
 *
 * Supabase's dashboard calls it `EXPO_PUBLIC_SUPABASE_KEY` in the React Native
 * quickstart, while this repo has always called it `…_ANON_KEY` (the legacy
 * name, and the one `env.example` documents). Both work, so pasting the
 * dashboard snippet does not silently leave the app unconfigured.
 *
 * Exported and pure so the alias is testable without touching `process.env`.
 */
export function resolveSupabaseKey(env: {
  EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
  EXPO_PUBLIC_SUPABASE_KEY?: string;
}): string {
  return env.EXPO_PUBLIC_SUPABASE_ANON_KEY || env.EXPO_PUBLIC_SUPABASE_KEY || "";
}

// A regex rather than `new URL`: React Native's URL polyfill does not
// implement every getter, and this only has to tell "a URL" from "not a URL".
const HTTP_URL = /^(https?):\/\/[^\s/?#]+(?:[/?#]\S*)?$/i;

function backendProblems(url: string, key: string): ConfigProblem[] {
  const problems: ConfigProblem[] = [];
  const match = HTTP_URL.exec(url);
  if (url === "") {
    problems.push({ key: "EXPO_PUBLIC_SUPABASE_URL", reason: "missing" });
  } else if (match === null) {
    problems.push({ key: "EXPO_PUBLIC_SUPABASE_URL", reason: "invalid" });
  } else if (match[1]!.toLowerCase() !== "https") {
    // docs/09 §4 "HTTPS only": plain http is for the local dev stack only.
    problems.push({ key: "EXPO_PUBLIC_SUPABASE_URL", reason: "insecure" });
  }
  if (key === "") {
    problems.push({ key: "EXPO_PUBLIC_SUPABASE_ANON_KEY", reason: "missing" });
  }
  return problems;
}

/**
 * Pure resolver, exported for tests. `devBuild` is `__DEV__` in the app: a
 * release bundle must say which environment it is, and only an explicit (or,
 * in a dev bundle, implied) `development` tolerates a missing backend.
 */
export function resolveConfig(
  env: RawEnv,
  devBuild: boolean,
): { config: AppConfig; problems: ConfigProblem[] } {
  const problems: ConfigProblem[] = [];

  const rawAppEnv = env.EXPO_PUBLIC_APP_ENV ?? "";
  const parsedAppEnv = appEnvSchema.safeParse(rawAppEnv);
  let appEnv: AppEnv;
  if (parsedAppEnv.success) {
    appEnv = parsedAppEnv.data;
  } else {
    // A release bundle is never guessed to be development.
    appEnv = devBuild ? "development" : "production";
    if (rawAppEnv !== "" || !devBuild) {
      problems.push({
        key: "EXPO_PUBLIC_APP_ENV",
        reason: rawAppEnv === "" ? "missing" : "invalid",
      });
    }
  }

  const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL ?? "";
  const supabaseAnonKey = resolveSupabaseKey(env);
  if (appEnv !== "development") {
    problems.push(...backendProblems(supabaseUrl, supabaseAnonKey));
  }

  // Failed closed: no backend at all rather than a guessed one.
  const failedClosed = appEnv !== "development" && problems.length > 0;
  return {
    config: {
      appEnv,
      supabaseUrl: failedClosed ? "" : supabaseUrl,
      supabaseAnonKey: failedClosed ? "" : supabaseAnonKey,
      mapplsMapSdkKey: env.EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY ?? "",
      // Store links for the S4 "use the mobile app" notice. Empty until the app
      // is published (M12c); the notice hides the store buttons while unset.
      androidStoreUrl: env.EXPO_PUBLIC_ANDROID_STORE_URL ?? "",
      iosStoreUrl: env.EXPO_PUBLIC_IOS_STORE_URL ?? "",
      // Kept when misconfigured, so the failure can still be reported.
      sentryDsn: env.EXPO_PUBLIC_SENTRY_DSN ?? "",
      // D1's policy link (docs/09 §1). Empty until the policy is published;
      // D1 hides the link while unset.
      privacyPolicyUrl: env.EXPO_PUBLIC_PRIVACY_POLICY_URL ?? "",
    },
    problems,
  };
}

// Every EXPO_PUBLIC_* is referenced literally: Metro only inlines
// `process.env.EXPO_PUBLIC_X` member expressions, so reading `process.env` as
// a whole object gave release bundles an empty env (found in M2).
const resolved = resolveConfig(
  {
    EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    EXPO_PUBLIC_SUPABASE_KEY: process.env.EXPO_PUBLIC_SUPABASE_KEY,
    EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY: process.env.EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY,
    EXPO_PUBLIC_ANDROID_STORE_URL: process.env.EXPO_PUBLIC_ANDROID_STORE_URL,
    EXPO_PUBLIC_IOS_STORE_URL: process.env.EXPO_PUBLIC_IOS_STORE_URL,
    EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
    EXPO_PUBLIC_PRIVACY_POLICY_URL: process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL,
  },
  __DEV__,
);

if (resolved.problems.length > 0) {
  const message =
    "Invalid EXPO_PUBLIC_* environment variables:\n" +
    resolved.problems.map((p) => `  - ${p.key}: ${p.reason}`).join("\n");
  if (resolved.config.appEnv === "development" && process.env.JEST_WORKER_ID === undefined) {
    // Fail loudly in dev: a broken env must stop the app here.
    throw new Error(message);
  }
  console.warn(message);
}

export const config: AppConfig = resolved.config;
/** Non-empty ⇒ the app must not run (app/_layout.tsx renders Misconfigured). */
export const configProblems: readonly ConfigProblem[] = resolved.problems;

export const isDev = config.appEnv === "development";
export const isProd = config.appEnv === "production";
