import { config, configError, resolveConfig } from '../config';

const good = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
};

describe('config env validation', () => {
  it('falls back to the local stack in development when env vars are absent', () => {
    // In the Jest environment (__DEV__) no EXPO_PUBLIC_* vars are set.
    expect(config.supabaseUrl).toBe('http://localhost:54321');
    expect(config.supabaseAnonKey).toBe('');
    expect(config.appEnv).toBe('development');
    expect(config.isDev).toBe(true);
    expect(config.isProd).toBe(false);
    expect(configError).toBeNull();
  });

  it('never contains server-only secret values', () => {
    const json = JSON.stringify(config);
    expect(json).not.toMatch(/SERVICE_ROLE|CLIENT_SECRET|MAPPLS_CLIENT/i);
  });

  describe('development', () => {
    it('allows the local http stack', () => {
      const r = resolveConfig(
        { EXPO_PUBLIC_APP_ENV: 'development', EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' },
        true,
      );
      expect(r.error).toBeNull();
      expect(r.config.supabaseUrl).toBe('http://127.0.0.1:54321');
    });

    it('reports an invalid URL (the module throws on it in development)', () => {
      const r = resolveConfig(
        { EXPO_PUBLIC_APP_ENV: 'development', EXPO_PUBLIC_SUPABASE_URL: 'not a url' },
        true,
      );
      expect(r.error).toMatch(/EXPO_PUBLIC_SUPABASE_URL/);
      expect(r.config.isDev).toBe(true);
    });
  });

  describe.each(['preview', 'production'] as const)('%s fails closed', (appEnv) => {
    it('missing URL and key → error, never localhost', () => {
      const r = resolveConfig({ EXPO_PUBLIC_APP_ENV: appEnv }, false);
      expect(r.error).toMatch(/EXPO_PUBLIC_SUPABASE_URL is required/);
      expect(r.error).toMatch(/EXPO_PUBLIC_SUPABASE_ANON_KEY is required/);
      expect(r.config.supabaseUrl).toBe('');
      expect(r.config.supabaseUrl).not.toMatch(/localhost|127\.0\.0\.1/);
      expect(r.config.supabaseAnonKey).toBe('');
      expect(r.config.appEnv).toBe(appEnv);
    });

    it('http URL → error (docs/09 §4 HTTPS only)', () => {
      const r = resolveConfig(
        {
          ...good,
          EXPO_PUBLIC_APP_ENV: appEnv,
          EXPO_PUBLIC_SUPABASE_URL: 'http://api.example.com',
        },
        false,
      );
      expect(r.error).toMatch(/https/);
      expect(r.config.supabaseUrl).toBe('');
    });

    it('fails closed in a dev-client bundle too', () => {
      expect(resolveConfig({ EXPO_PUBLIC_APP_ENV: appEnv }, true).error).not.toBeNull();
    });

    it('valid env → no error, values passed through', () => {
      const r = resolveConfig(
        {
          ...good,
          EXPO_PUBLIC_APP_ENV: appEnv,
          EXPO_PUBLIC_SENTRY_DSN: 'https://k@o1.ingest.sentry.io/1',
        },
        false,
      );
      expect(r.error).toBeNull();
      expect(r.config.supabaseUrl).toBe(good.EXPO_PUBLIC_SUPABASE_URL);
      expect(r.config.isProd).toBe(appEnv === 'production');
    });

    it('keeps the Sentry DSN when the backend is misconfigured, so it can be reported', () => {
      const r = resolveConfig(
        { EXPO_PUBLIC_APP_ENV: appEnv, EXPO_PUBLIC_SENTRY_DSN: 'https://k@o1.ingest.sentry.io/1' },
        false,
      );
      expect(r.error).not.toBeNull();
      expect(r.config.sentryDsn).toBe('https://k@o1.ingest.sentry.io/1');
    });
  });

  describe('release bundle (__DEV__ false)', () => {
    it('without EXPO_PUBLIC_APP_ENV → error, treated as production, no localhost', () => {
      const r = resolveConfig({}, false);
      expect(r.error).toMatch(/EXPO_PUBLIC_APP_ENV: is required/);
      expect(r.config.appEnv).toBe('production');
      expect(r.config.supabaseUrl).toBe('');
    });

    it('unknown EXPO_PUBLIC_APP_ENV → error', () => {
      const r = resolveConfig({ ...good, EXPO_PUBLIC_APP_ENV: 'staging' }, false);
      expect(r.error).toMatch(/unknown value "staging"/);
      expect(r.config.supabaseUrl).toBe('');
    });
  });
});
