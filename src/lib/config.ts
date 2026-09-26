import { z } from 'zod';

// EXPO_PUBLIC_* values are inlined at build time, so they must be read with
// static `process.env.EXPO_PUBLIC_X` property access (no destructuring).
const schema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: z.url(),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  EXPO_PUBLIC_APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
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
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
  EXPO_PUBLIC_PLAY_STORE_URL: process.env.EXPO_PUBLIC_PLAY_STORE_URL || undefined,
  EXPO_PUBLIC_APP_STORE_URL: process.env.EXPO_PUBLIC_APP_STORE_URL || undefined,
});
