import { z } from 'zod';

/**
 * Public runtime configuration (M1, fail-closed since R0).
 * Validates EXPO_PUBLIC_* env vars with zod. Only EXPO_PUBLIC_* vars are bundled
 * (CLAUDE.md hard rule 6); secrets (MAPPLS_*, SUPABASE_SERVICE_ROLE_KEY) never appear here.
 *
 * - development: missing values fall back to the local stack; an invalid env throws so
 *   nobody builds against a broken env silently.
 * - preview / production, or a release bundle (`__DEV__` false) with no APP_ENV: an invalid
 *   or missing env FAILS CLOSED — `configError` is set, the backend URL/key are empty (never
 *   localhost), and app/_layout.tsx shows the blocking "App misconfigured" screen.
 */
export const APP_ENVS = ['development', 'preview', 'production'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

type RawEnv = Record<string, string | undefined>;

const devSchema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: z
    .string()
    .url('EXPO_PUBLIC_SUPABASE_URL must be a valid URL')
    .default('http://localhost:54321'),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: z.string().default(''),
});

const releaseSchema = z.object({
  // docs/09 §4 "HTTPS only": plain http is allowed only for the local dev stack.
  EXPO_PUBLIC_SUPABASE_URL: z
    .string({ error: 'EXPO_PUBLIC_SUPABASE_URL is required' })
    .url('EXPO_PUBLIC_SUPABASE_URL must be a valid URL')
    .refine((u) => u.startsWith('https://'), 'must use https:// outside development'),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: z
    .string({ error: 'EXPO_PUBLIC_SUPABASE_ANON_KEY is required' })
    .min(1, 'EXPO_PUBLIC_SUPABASE_ANON_KEY is required'),
});

const optional = z.object({
  EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY: z.string().default(''),
  EXPO_PUBLIC_SENTRY_DSN: z.string().default(''),
});

export type AppConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  mapplsMapSdkKey: string;
  appEnv: AppEnv;
  sentryDsn: string;
  isDev: boolean;
  isProd: boolean;
};

export type ResolvedConfig = { config: AppConfig; error: string | null };

const issuesOf = (error: z.ZodError) =>
  error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);

/**
 * Pure resolver (exported for tests). `devBuild` is `__DEV__` in the app: a release bundle
 * must say which environment it is; only an explicit `development` allows localhost.
 */
export function resolveConfig(env: RawEnv, devBuild: boolean): ResolvedConfig {
  const issues: string[] = [];
  const rawAppEnv = env.EXPO_PUBLIC_APP_ENV;
  let appEnv: AppEnv;
  if (rawAppEnv === undefined || rawAppEnv === '') {
    appEnv = devBuild ? 'development' : 'production';
    if (!devBuild) issues.push('EXPO_PUBLIC_APP_ENV: is required in a release build');
  } else if ((APP_ENVS as readonly string[]).includes(rawAppEnv)) {
    appEnv = rawAppEnv as AppEnv;
  } else {
    appEnv = devBuild ? 'development' : 'production';
    issues.push(`EXPO_PUBLIC_APP_ENV: unknown value "${rawAppEnv}" (${APP_ENVS.join(' | ')})`);
  }

  const extras = optional.parse({
    EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY: env.EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY,
    EXPO_PUBLIC_SENTRY_DSN: env.EXPO_PUBLIC_SENTRY_DSN,
  });
  const backendEnv = {
    EXPO_PUBLIC_SUPABASE_URL: env.EXPO_PUBLIC_SUPABASE_URL || undefined,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: env.EXPO_PUBLIC_SUPABASE_ANON_KEY || undefined,
  };
  const backend = (appEnv === 'development' ? devSchema : releaseSchema).safeParse(backendEnv);
  if (!backend.success) issues.push(...issuesOf(backend.error));

  const failed = issues.length > 0;
  return {
    config: {
      // Failed closed: no backend at all rather than a guessed one.
      supabaseUrl: failed ? '' : backend.data!.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: failed ? '' : backend.data!.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      mapplsMapSdkKey: extras.EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY,
      appEnv,
      // Kept even when the backend is misconfigured, so the failure can be reported.
      sentryDsn: extras.EXPO_PUBLIC_SENTRY_DSN,
      isDev: appEnv === 'development',
      isProd: appEnv === 'production',
    },
    error: failed
      ? [
          '[config] Invalid or missing environment variables:',
          ...issues.map((i) => `  - ${i}`),
        ].join('\n')
      : null,
  };
}

// Each EXPO_PUBLIC_* must be referenced literally so Metro inlines it.
const resolved = resolveConfig(
  {
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY: process.env.EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY,
    EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
    EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
  },
  __DEV__,
);

if (resolved.error && resolved.config.isDev) {
  // In development we crash so nobody builds against a broken env silently.
  throw new Error(
    `${resolved.error}\n\nCopy .env.example to .env and fill in the values, then restart the dev server.`,
  );
}

export const config: AppConfig = resolved.config;
/** Non-null ⇒ the app must not run (app/_layout.tsx renders the Misconfigured screen). */
export const configError: string | null = resolved.error;
