import type { ExpoConfig } from 'expo/config';

import { appEnvFrom, buildConfig } from '../../app.config';

/**
 * R0: app.config.ts assertions. Exact permission strings are docs/09 §3 (quoted verbatim in
 * the Play declaration and App Review notes — change them only together with those docs).
 * The mod-level checks (no iOS `fetch` background mode, cleartext off in the merged Android
 * manifest) need `expo config --type introspect`: test/config/introspect.test.mjs.
 */
const WHEN_IN_USE =
  'Namma Lorry uses your location to start and end trips at the pickup and delivery points.';
const ALWAYS =
  'Namma Lorry records your route in the background only while a trip you started is in progress, so your driving experience can be verified.';

const pluginOptions = (config: ExpoConfig, name: string) => {
  const entry = config.plugins?.find((p) => (Array.isArray(p) ? p[0] : p) === name);
  return Array.isArray(entry) ? (entry[1] as Record<string, unknown>) : undefined;
};

describe('app.config', () => {
  const prod = buildConfig({ EXPO_PUBLIC_APP_ENV: 'production' });

  it('uses the docs/09 §3 location strings exactly', () => {
    const loc = pluginOptions(prod, 'expo-location');
    expect(loc).toMatchObject({
      locationWhenInUsePermission: WHEN_IN_USE,
      locationAlwaysAndWhenInUsePermission: ALWAYS,
      locationAlwaysPermission: ALWAYS,
      motionUsagePermission: false,
      isIosBackgroundLocationEnabled: true,
      isAndroidBackgroundLocationEnabled: true,
      isAndroidForegroundServiceEnabled: true,
    });
  });

  it('declares only the location background mode on iOS', () => {
    expect(prod.ios?.infoPlist?.UIBackgroundModes).toEqual(['location']);
  });

  it('Android: backup off, POST_NOTIFICATIONS requested, unused permissions blocked', () => {
    expect(prod.android?.allowBackup).toBe(false);
    expect(prod.android?.permissions).toContain('android.permission.POST_NOTIFICATIONS');
    expect(prod.android?.blockedPermissions).toEqual(
      expect.arrayContaining([
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.RECORD_AUDIO',
        'android.permission.ACTIVITY_RECOGNITION',
      ]),
    );
  });

  it.each([
    [{}, 'Namma Lorry (Dev)', 'development'],
    [{ EXPO_PUBLIC_APP_ENV: 'development' }, 'Namma Lorry (Dev)', 'development'],
    [{ EXPO_PUBLIC_APP_ENV: 'preview' }, 'Namma Lorry (Staging)', 'preview'],
    [{ EXPO_PUBLIC_APP_ENV: 'production' }, 'Namma Lorry', 'production'],
  ])('env %j → name "%s"', (env, name, appEnv) => {
    const config = buildConfig(env);
    expect(config.name).toBe(name);
    expect(config.extra?.appEnv).toBe(appEnv);
    // Same identifiers for every profile (one store listing).
    expect(config.ios?.bundleIdentifier).toBe('com.nammalorry.app');
    expect(config.android?.package).toBe('com.nammalorry.app');
  });

  it('rejects an unknown EXPO_PUBLIC_APP_ENV', () => {
    expect(() => appEnvFrom({ EXPO_PUBLIC_APP_ENV: 'staging' })).toThrow(/must be one of/);
    expect(() => buildConfig({ EXPO_PUBLIC_APP_ENV: 'prod' })).toThrow(/must be one of/);
  });

  it('adds the Sentry source-map plugin only when SENTRY_AUTH_TOKEN is set', () => {
    expect(pluginOptions(prod, '@sentry/react-native/expo')).toBeUndefined();
    const withToken = buildConfig({
      EXPO_PUBLIC_APP_ENV: 'production',
      SENTRY_AUTH_TOKEN: 't',
      SENTRY_ORG: 'o',
      SENTRY_PROJECT: 'p',
    });
    expect(pluginOptions(withToken, '@sentry/react-native/expo')).toEqual({
      organization: 'o',
      project: 'p',
    });
  });
});
