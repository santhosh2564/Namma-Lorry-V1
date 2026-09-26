import { config } from '../config';

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
});
