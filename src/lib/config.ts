import { z } from 'zod';

/**
 * Public runtime configuration (M1).
 * Validates EXPO_PUBLIC_* env vars with zod and fails loudly in dev.
 * Only EXPO_PUBLIC_* vars are bundled (CLAUDE.md hard rule 6); secrets
 * (MAPPLS_*, SUPABASE_SERVICE_ROLE_KEY) never appear here.
 */
const schema = z
  .object({
    EXPO_PUBLIC_SUPABASE_URL: z
      .string()
      .url('EXPO_PUBLIC_SUPABASE_URL must be a valid URL')
      .default('http://localhost:54321'),
    EXPO_PUBLIC_SUPABASE_ANON_KEY: z.string().default(''),
    EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY: z.string().default(''),
    EXPO_PUBLIC_APP_ENV: z.enum(['development', 'preview', 'production']).default('development'),
    EXPO_PUBLIC_SENTRY_DSN: z.string().default(''),
  })
  // docs/09 §4 "HTTPS only": plain http is allowed only for the local dev stack.
  .superRefine((env, ctx) => {
    if (
      env.EXPO_PUBLIC_APP_ENV !== 'development' &&
      !env.EXPO_PUBLIC_SUPABASE_URL.startsWith('https://')
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['EXPO_PUBLIC_SUPABASE_URL'],
        message: `must use https:// outside development (got ${env.EXPO_PUBLIC_SUPABASE_URL})`,
      });
    }
  });

/** Exported for tests; the app uses `config` below. */
export const parseEnv = (env: Record<string, string | undefined>) => schema.safeParse(env);

const parsed = parseEnv({
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY: process.env.EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY,
  EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
  EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
});

function failLoudly(issues: string[]): void {
  const message = [
    '[config] Invalid or missing environment variables:',
    ...issues.map((i) => `  - ${i}`),
    '',
    'Copy .env.example to .env and fill in the values, then restart the dev server.',
  ].join('\n');
  // In dev we crash so nobody builds against a broken env silently.
  if (process.env.NODE_ENV !== 'production' && __DEV__) {
    throw new Error(message);
  }
  console.error(message);
}

if (!parsed.success) {
  failLoudly(parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`));
}

const raw = parsed.success ? parsed.data : schema.parse({});

export const config = {
  supabaseUrl: raw.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: raw.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  mapplsMapSdkKey: raw.EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY,
  appEnv: raw.EXPO_PUBLIC_APP_ENV,
  sentryDsn: raw.EXPO_PUBLIC_SENTRY_DSN,
  isDev: raw.EXPO_PUBLIC_APP_ENV === 'development',
  isProd: raw.EXPO_PUBLIC_APP_ENV === 'production',
} as const;

export type AppConfig = typeof config;
