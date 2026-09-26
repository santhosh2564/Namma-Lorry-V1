// config.ts validates process.env at import time; give it a valid environment first.
process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_local_test_key';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseConfig } = require('./config') as typeof import('./config');

const base = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://example-ref.supabase.co',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example_key_for_tests',
};

describe('parseConfig', () => {
  it('accepts a publishable key and defaults the env', () => {
    expect(parseConfig(base)).toMatchObject({ ...base, EXPO_PUBLIC_APP_ENV: 'development' });
  });

  it('rejects legacy anon JWTs and secret keys in the app bundle', () => {
    for (const key of ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.x', 'sb_secret_abc123abc123abc123']) {
      expect(() => parseConfig({ ...base, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key })).toThrow(
        /EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
      );
    }
  });

  it('fails loudly when the URL is missing', () => {
    expect(() =>
      parseConfig({ EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: base.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY }),
    ).toThrow(/Invalid app environment/);
  });
});
