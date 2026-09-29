import { defineConfig, devices } from '@playwright/test';

import { localEnv } from './e2e/support/supabase';

/**
 * Web E2E (docs/10 §1): the console against the local Supabase stack.
 * Prereq: `npx supabase start` (or `db start` + auth). The Expo web dev server is started
 * here with the local URL/anon key.
 */
const PORT = 8099;
const { url, anon } = localEnv();

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: `npx expo start --web --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    env: {
      CI: '1',
      EXPO_PUBLIC_SUPABASE_URL: url,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: anon,
      EXPO_PUBLIC_APP_ENV: 'development',
    },
  },
});
