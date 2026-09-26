import { z } from 'zod';

// EXPO_PUBLIC_* values are inlined at build time, so they must be read with
// static `process.env.EXPO_PUBLIC_X` property access (no destructuring).
const schema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: z.url(),
  // Publishable key (sb_publishable_…). The legacy anon JWT is no longer used.
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().startsWith('sb_publishable_'),
  EXPO_PUBLIC_APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  // Mappls Web/Map SDK static key (restricted by domain / package in the Mappls console).
  // Optional: without it the console shows a map placeholder and coordinate fields.
  EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY: z.string().min(8).optional(),
  // Store listing links for S4 "use the mobile app"; buttons are hidden until set (M12c).
  EXPO_PUBLIC_PLAY_STORE_URL: z.url().optional(),
  EXPO_PUBLIC_APP_STORE_URL: z.url().optional(),
});

export type AppConfig = z.infer<typeof schema>;

export function parseConfig(env: Record<string, string | undefined>): AppConfig {
  const result = schema.safeParse(env);
  if (!result.success) {
    const fields = result.error.issues.map((i) => i.path.join('.')).join(', ');
    // Fail loudly: a misconfigured build must never silently talk to the wrong backend.
    throw new Error(`Invalid app environment (${fields}). Copy .env.example to .env and fill it in.`);
  }
  return result.data;
}

export const config = parseConfig({
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
  EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY: process.env.EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY || undefined,
  EXPO_PUBLIC_PLAY_STORE_URL: process.env.EXPO_PUBLIC_PLAY_STORE_URL || undefined,
  EXPO_PUBLIC_APP_STORE_URL: process.env.EXPO_PUBLIC_APP_STORE_URL || undefined,
});
