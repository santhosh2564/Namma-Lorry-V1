import type { ComponentType } from 'react';
import { render } from '@testing-library/react-native';

import en from '@/i18n/en.json';
import { reportError } from '@/lib/sentry';

/**
 * R0 P0-3: a release bundle with a broken env shows "App misconfigured" and reports it.
 * babel-preset-expo inlines EXPO_PUBLIC_* at transform time, so the env can't be changed
 * per test; `configError` comes from resolveConfig (covered in src/lib/__tests__/config).
 */
let mockConfigError: string | null =
  '[config] Invalid or missing environment variables:\n  - EXPO_PUBLIC_SUPABASE_URL is required';

jest.mock('@/lib/config', () => ({
  config: { supabaseUrl: '', supabaseAnonKey: '', sentryDsn: '', appEnv: 'production' },
  get configError() {
    return mockConfigError;
  },
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native');
  return { Stack: () => <Text testID="app-stack">app</Text> };
});
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));
jest.mock('@/i18n/language', () => ({ restoreLanguage: jest.fn(async () => undefined) }));
jest.mock('@/lib/sentry', () => ({
  initSentry: jest.fn(),
  reportError: jest.fn(),
  wrapWithSentry: (c: unknown) => c,
}));

describe('root layout config gate', () => {
  // Imported with the error set: the module-level report runs exactly once, at startup.
  const Layout: ComponentType = require('../../app/_layout').default;

  it('config error → blocking screen, reported to Sentry, no navigator', async () => {
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), { kind: 'config' });
    const screen = await render(<Layout />);
    expect(screen.getByText(en.errors.misconfiguredTitle)).toBeTruthy();
    expect(screen.queryByTestId('app-stack')).toBeNull();
    expect(screen.queryByText(/EXPO_PUBLIC/)).toBeNull(); // technical detail never on screen
  });

  it('valid config → the app navigator renders', async () => {
    mockConfigError = null;
    const screen = await render(<Layout />);
    expect(screen.getByTestId('app-stack')).toBeTruthy();
    expect(screen.queryByText(en.errors.misconfiguredTitle)).toBeNull();
  });
});
