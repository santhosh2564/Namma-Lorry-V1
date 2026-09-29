import { config, parseEnv } from '../config';

describe('config env validation', () => {
  it('falls back to safe defaults when env vars are absent', () => {
    // In the Jest environment no EXPO_PUBLIC_* vars are set.
    expect(config.supabaseUrl).toBe('http://localhost:54321');
    expect(config.supabaseAnonKey).toBe('');
    expect(config.appEnv).toBe('development');
    expect(config.isDev).toBe(true);
    expect(config.isProd).toBe(false);
  });

  it('never contains server-only secret values', () => {
    const json = JSON.stringify(config);
    expect(json).not.toMatch(/SERVICE_ROLE|CLIENT_SECRET|MAPPLS_CLIENT/i);
  });

  it('requires https for the backend outside development (docs/09 §4)', () => {
    expect(
      parseEnv({
        EXPO_PUBLIC_APP_ENV: 'production',
        EXPO_PUBLIC_SUPABASE_URL: 'http://api.example.com',
      }).success,
    ).toBe(false);
    expect(
      parseEnv({
        EXPO_PUBLIC_APP_ENV: 'preview',
        EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
      }).success,
    ).toBe(true);
    expect(
      parseEnv({
        EXPO_PUBLIC_APP_ENV: 'development',
        EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      }).success,
    ).toBe(true);
  });
});
