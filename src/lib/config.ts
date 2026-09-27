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

export type AppConfig = {
  appEnv: AppEnv;
  supabaseUrl: string;
  supabaseAnonKey: string;
  mapplsMapSdkKey: string;
  androidStoreUrl: string;
  iosStoreUrl: string;
  sentryDsn: string;
};

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
    supabaseAnonKey: env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    mapplsMapSdkKey: env.EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY,
    androidStoreUrl: env.EXPO_PUBLIC_ANDROID_STORE_URL,
    iosStoreUrl: env.EXPO_PUBLIC_IOS_STORE_URL,
    sentryDsn: env.EXPO_PUBLIC_SENTRY_DSN,
  };
}

export const config: AppConfig = loadConfig();

export const isDev = config.appEnv === "development";
export const isProd = config.appEnv === "production";
