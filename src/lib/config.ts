import { z } from "zod";

/**
 * Runtime configuration (M1).
 *
 * All public runtime configuration comes from EXPO_PUBLIC_* env vars and is
 * validated here with zod. Server-only secrets (Mappls client secret, service
 * role key) never appear in this module — they live in Edge Function secrets
 * (CLAUDE.md hard rule 6).
 *
 * Fails loudly in development when required vars are missing; logs a warning
 * in staging/production so a misconfigured release is visible in Sentry.
 */
const appEnvSchema = z.enum(["development", "staging", "production"]);

const publicEnvSchema = z.object({
  EXPO_PUBLIC_APP_ENV: appEnvSchema.default("development"),
  // Required before M5 (auth) — tolerated as empty in M1 so the scaffold runs.
  EXPO_PUBLIC_SUPABASE_URL: z.string().default(""),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: z.string().default(""),
  /**
   * Supabase's dashboard calls the browser-safe key `EXPO_PUBLIC_SUPABASE_KEY`
   * in the React Native quickstart, while this repo has always called it
   * `…_ANON_KEY` (the legacy name, and the one `env.example` documents). Accept
   * both so pasting the dashboard snippet works instead of silently leaving the
   * app showing "Supabase is not configured". They are the same value.
   */
  EXPO_PUBLIC_SUPABASE_KEY: z.string().default(""),
  // Required before M3 (maps).
  EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY: z.string().default(""),
  // Store links for the S4 "use the mobile app" notice. Empty until the app is
  // published (M12c); the notice hides the store buttons while they are unset.
  EXPO_PUBLIC_ANDROID_STORE_URL: z.string().default(""),
  EXPO_PUBLIC_IOS_STORE_URL: z.string().default(""),
  // Required before M12a (observability).
  EXPO_PUBLIC_SENTRY_DSN: z.string().default(""),
});

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
};

/**
 * The browser-safe key, under either name.
 *
 * Exported and pure so the alias is testable without touching `process.env`.
 */
export function resolveSupabaseKey(env: {
  EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
  EXPO_PUBLIC_SUPABASE_KEY?: string;
}): string {
  return env.EXPO_PUBLIC_SUPABASE_ANON_KEY || env.EXPO_PUBLIC_SUPABASE_KEY || "";
}

export function resolveConfig(
  env: Record<string, string | undefined>,
  _devBuild: boolean,
): { config: AppConfig; problems: ConfigProblem[] } {
  const parsed = publicEnvSchema.parse(env);
  return {
    config: {
      appEnv: parsed.EXPO_PUBLIC_APP_ENV,
      supabaseUrl: parsed.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: resolveSupabaseKey(parsed),
      mapplsMapSdkKey: parsed.EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY,
      androidStoreUrl: parsed.EXPO_PUBLIC_ANDROID_STORE_URL,
      iosStoreUrl: parsed.EXPO_PUBLIC_IOS_STORE_URL,
      sentryDsn: parsed.EXPO_PUBLIC_SENTRY_DSN,
    },
    problems: [],
  };
}

function loadConfig(): AppConfig {
  const parsed = publicEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    const message = `Invalid EXPO_PUBLIC_* environment variables:\n${issues}`;
    if (process.env.NODE_ENV !== "production" && process.env.JEST_WORKER_ID === undefined) {
      // Fail loudly in dev: a missing/broken env must stop the app here.
      throw new Error(message);
    }
    console.warn(message);
    return {
      appEnv: "development",
      supabaseUrl: "",
      supabaseAnonKey: "",
      mapplsMapSdkKey: "",
      androidStoreUrl: "",
      iosStoreUrl: "",
      sentryDsn: "",
    };
  }

  const env = parsed.data;
  return {
    appEnv: env.EXPO_PUBLIC_APP_ENV,
    supabaseUrl: env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: resolveSupabaseKey(env),
    mapplsMapSdkKey: env.EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY,
    androidStoreUrl: env.EXPO_PUBLIC_ANDROID_STORE_URL,
    iosStoreUrl: env.EXPO_PUBLIC_IOS_STORE_URL,
    sentryDsn: env.EXPO_PUBLIC_SENTRY_DSN,
  };
}

export const config: AppConfig = loadConfig();
export const configProblems: readonly ConfigProblem[] = [];

export const isDev = config.appEnv === "development";
export const isProd = config.appEnv === "production";
