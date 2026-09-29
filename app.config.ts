import type { ExpoConfig } from 'expo/config';
import { withAndroidManifest, withInfoPlist, type ConfigPlugin } from 'expo/config-plugins';

/**
 * Namma Lorry — Expo app config (M12c release).
 * Reads EXPO_PUBLIC_* env vars; secrets are NEVER referenced here.
 *
 * Versioning: `version` is the user-facing version (and the EAS Update runtime version,
 * see `runtimeVersion`). Build numbers (iOS buildNumber / Android versionCode) are NOT set
 * here: eas.json uses `appVersionSource: "remote"` + `autoIncrement`, so EAS owns them.
 *
 * Assets: the files under ./assets are placeholders until the brand assets exist
 * (docs/release/ASSETS.md). `npm run release:assets` fails a production build on them.
 */

// Paste the id printed by `eas init` (docs/release/README.md step 3). All-zero = not linked.
const EAS_PROJECT_ID = '00000000-0000-0000-0000-000000000000';
const EAS_LINKED = !/^0{8}-/.test(EAS_PROJECT_ID);

const BRAND_NAVY = '#0F2A44';

// docs/09 §3 — exact wording; the Play declaration and App Review notes quote these.
const LOCATION_WHEN_IN_USE =
  'Namma Lorry uses your location to start and end trips at the pickup and delivery points.';
const LOCATION_ALWAYS =
  'Namma Lorry records your route in the background only while a trip you started is in progress, so your driving experience can be verified.';

export const APP_ENVS = ['development', 'preview', 'production'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

type Env = Record<string, string | undefined>;

/** Unset → development (local `expo start`); anything else must be one of APP_ENVS (R0). */
export function appEnvFrom(env: Env): AppEnv {
  const value = env.EXPO_PUBLIC_APP_ENV;
  if (value === undefined || value === '') return 'development';
  if (!(APP_ENVS as readonly string[]).includes(value)) {
    throw new Error(
      `[app.config] EXPO_PUBLIC_APP_ENV must be one of ${APP_ENVS.join(', ')} (got "${value}")`,
    );
  }
  return value as AppEnv;
}

// `env` is passed in rather than read as process.env.EXPO_PUBLIC_* (which babel inlines),
// so tests can vary it.
const defineConfig = (env: Env): ExpoConfig => {
  const appEnv = appEnvFrom(env);

  // Same bundle id / package for every profile (one store listing; preview builds go to
  // Play internal testing + TestFlight). Only the display name tells testers apart.
  const name =
    appEnv === 'production'
      ? 'Namma Lorry'
      : appEnv === 'preview'
        ? 'Namma Lorry (Staging)'
        : 'Namma Lorry (Dev)';

  return {
    name,
    slug: 'namma-lorry',
    scheme: 'namma-lorry',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    icon: './assets/icon.png',
    backgroundColor: BRAND_NAVY,

    // EAS Update. `appVersion` (not `fingerprint`): fingerprints computed on Windows can
    // differ from the Linux build worker (line endings), which silently blocks updates.
    // Rule (docs/RUNBOOK.md §2): any native change ⇒ bump `version`.
    runtimeVersion: { policy: 'appVersion' },
    ...(EAS_LINKED
      ? {
          updates: {
            url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
            // Launch the embedded/cached bundle immediately; a downloaded update applies
            // on the next cold start. Never block a driver's launch on the network.
            fallbackToCacheTimeout: 0,
            checkAutomatically: 'ON_LOAD',
          },
        }
      : {}),

    ios: {
      bundleIdentifier: 'com.nammalorry.app',
      supportsTablet: false,
      config: {
        // HTTPS only (exempt) — skips the export-compliance question on every upload.
        usesNonExemptEncryption: false,
      },
      infoPlist: {
        // Location strings are set by the expo-location plugin below (single source).
        UIBackgroundModes: ['location'],
      },
      // Required-reason APIs used by React Native / Expo core (App Store rejects builds
      // without them). Expo modules ship their own manifests; this covers the app target.
      privacyManifests: {
        NSPrivacyAccessedAPITypes: [
          {
            NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
            NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
          },
          {
            NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
            NSPrivacyAccessedAPITypeReasons: ['C617.1'],
          },
          {
            NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
            NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
          },
          {
            NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
            NSPrivacyAccessedAPITypeReasons: ['E174.1'],
          },
        ],
      },
    },

    android: {
      package: 'com.nammalorry.app',
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: BRAND_NAVY,
      },
      // The SecureStore session and the SQLite point queue must not leave the device via
      // Google/adb backup (docs/09 §4 "Session").
      allowBackup: false,
      // Location + foreground-service permissions come from the expo-location plugin.
      // POST_NOTIFICATIONS: Android 13+ hides the trip notification without it, and Play's
      // background-location review expects that notification to be visible (docs/09 §2).
      // M9 (D1) must request it at runtime.
      permissions: ['android.permission.POST_NOTIFICATIONS'],
      // Template defaults we don't use. Fewer permissions = simpler Data safety form.
      blockedPermissions: [
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.RECORD_AUDIO',
        'android.permission.ACTIVITY_RECOGNITION',
      ],
    },

    web: {
      bundler: 'metro',
      output: 'single',
      favicon: './assets/favicon.png',
      name: 'Namma Lorry Console',
      shortName: 'Namma Lorry',
      themeColor: BRAND_NAVY,
      backgroundColor: '#F6F7F9',
    },

    // expo-keep-awake is installed as a dependency but NOT a config plugin:
    // it ships no app.plugin.js, and on Node >=22 loading its TS main entry
    // fails (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`).
    plugins: [
      'expo-router',
      'expo-font',
      [
        'expo-splash-screen',
        {
          image: './assets/splash.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: BRAND_NAVY,
        },
      ],
      [
        'expo-location',
        {
          locationWhenInUsePermission: LOCATION_WHEN_IN_USE,
          locationAlwaysAndWhenInUsePermission: LOCATION_ALWAYS,
          locationAlwaysPermission: LOCATION_ALWAYS,
          // We never use motion APIs; a generic default string invites App Review questions.
          motionUsagePermission: false,
          isIosBackgroundLocationEnabled: true,
          isAndroidBackgroundLocationEnabled: true,
          // FOREGROUND_SERVICE + FOREGROUND_SERVICE_LOCATION; the library manifest declares
          // LocationTaskService with foregroundServiceType="location".
          isAndroidForegroundServiceEnabled: true,
          isAndroidMotionActivityEnabled: false,
          // Monochrome status-bar icon for the "trip in progress" notification.
          androidForegroundServiceIcon: './assets/notification-icon.png',
        },
      ],
      // Sentry source-map upload at build time (M12a). Only when the token exists
      // (EAS secret SENTRY_AUTH_TOKEN), so local/CI builds without it still succeed.
      ...(env.SENTRY_AUTH_TOKEN
        ? [
            [
              '@sentry/react-native/expo',
              { organization: env.SENTRY_ORG, project: env.SENTRY_PROJECT },
            ] as [string, Record<string, unknown>],
          ]
        : []),
    ],

    experiments: {
      typedRoutes: false,
    },

    extra: {
      appEnv,
      ...(EAS_LINKED ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
    },
  };
};

/**
 * expo-task-manager's auto-applied plugin always adds the `fetch` background mode. We only
 * track via `location`; an unused background mode draws App Review questions (2.5.4).
 */
const withoutBackgroundFetch: ConfigPlugin = (config) =>
  withInfoPlist(config, (c) => {
    const modes = c.modResults.UIBackgroundModes as string[] | undefined;
    if (Array.isArray(modes)) c.modResults.UIBackgroundModes = modes.filter((m) => m !== 'fetch');
    return c;
  });

/**
 * docs/09 §4 "HTTPS only": release builds must not allow cleartext HTTP. Android 9+ already
 * defaults to false, but a library manifest can flip it on in the merge, so set it explicitly
 * on the app's <application> (R0). Development keeps the default so the dev client can reach
 * Metro over http.
 */
const withNoCleartextInRelease =
  (appEnv: AppEnv): ConfigPlugin =>
  (config) =>
    appEnv === 'development'
      ? config
      : withAndroidManifest(config, (c) => {
          const app = c.modResults.manifest.application?.[0];
          if (app) app.$['android:usesCleartextTraffic'] = 'false';
          return c;
        });

export function buildConfig(env: Env): ExpoConfig {
  return withNoCleartextInRelease(appEnvFrom(env))(withoutBackgroundFetch(defineConfig(env)));
}

export default buildConfig(process.env);
