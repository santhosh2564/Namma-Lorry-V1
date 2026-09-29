import type { ExpoConfig } from "expo/config";
import { withAndroidManifest, withInfoPlist, type ConfigPlugin } from "expo/config-plugins";

/**
 * Namma Lorry — app configuration.
 *
 * Public runtime configuration comes from EXPO_PUBLIC_* env vars, validated in
 * src/lib/config.ts.
 *
 * The expo-location plugin settings are the M9 (D1) half of the permission
 * story: background location and the Android foreground service are enabled in
 * the manifest so `startLocationUpdatesAsync` can run, and the permission
 * strings are the exact copy from docs/09 §3 — the same sentences the D1
 * disclosure paraphrases, so the store listing and the in-app notice agree.
 *
 * Release hardening (validation B5a, M3, M11) is asserted in app.config.test.ts
 * and, at the mod level, in test/config/introspect.test.mjs.
 */
const LOCATION_PERMISSION_WHEN_IN_USE =
  "Namma Lorry uses your location to start and end trips at the pickup and delivery points.";
const LOCATION_PERMISSION_ALWAYS =
  "Namma Lorry records your route in the background only while a trip you started is in progress, so your driving experience can be verified.";

// Same values as the zod enum in src/lib/config.ts (eas.json: development,
// preview → staging, production).
export const APP_ENVS = ["development", "staging", "production"] as const;
export type AppEnv = (typeof APP_ENVS)[number];

type Env = Record<string, string | undefined>;

/**
 * Unset or empty → development (local `expo start`). Anything else must be one
 * of APP_ENVS: a typo in an EAS profile must fail the build, not quietly ship a
 * development-flavoured app.
 */
export function appEnvFrom(env: Env): AppEnv {
  const value = env.EXPO_PUBLIC_APP_ENV;
  if (value === undefined || value === "") return "development";
  if (!(APP_ENVS as readonly string[]).includes(value)) {
    throw new Error(
      `[app.config] EXPO_PUBLIC_APP_ENV must be one of ${APP_ENVS.join(", ")} (got "${value}")`,
    );
  }
  return value as AppEnv;
}

const APP_NAMES: Record<AppEnv, string> = {
  development: "Namma Lorry (Dev)",
  staging: "Namma Lorry (Staging)",
  production: "Namma Lorry",
};

// EAS project @santhoshkrwork/namma-lorry (`eas init`, B5c). Builds and
// updates land here; the slug below must stay "namma-lorry" to match it.
const EAS_OWNER = "santhoshkrwork";
const EAS_PROJECT_ID = "2a3edc84-9fe4-4593-b278-ef919ec1b82c";

const defineConfig = (env: Env): ExpoConfig => {
  const appEnv = appEnvFrom(env);

  return {
    // Identifiers are shared by every profile; only the name tells testers apart.
    name: APP_NAMES[appEnv],
    slug: "namma-lorry",
    owner: EAS_OWNER,
    scheme: "namma-lorry",
    version: "1.0.0",

    // EAS Update. `appVersion`, not `fingerprint`: a fingerprint computed on
    // Windows can differ from the Linux build worker (line endings) and silently
    // block updates. Any native change therefore needs a `version` bump. Each
    // build profile's channel is in eas.json; publish with scripts/eas-update.mjs.
    runtimeVersion: { policy: "appVersion" },
    updates: {
      url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
      // Launch the embedded or cached bundle at once; a downloaded update applies
      // on the next cold start. A driver's launch never waits on the network.
      fallbackToCacheTimeout: 0,
      checkAutomatically: "ON_LOAD",
    },
    orientation: "portrait",
    userInterfaceStyle: "light",
    newArchEnabled: true,

    // Fixed app identities so native prebuild / EAS dev builds are reproducible.
    // (M12c finalises store metadata, icons and build numbers.) Restrict the Mappls
    // map SDK key to these identifiers in the Mappls console.
    // docs/09 §3 — iOS background delivery for the trip task.
    ios: {
      bundleIdentifier: "com.nammalorry.driver",
      supportsTablet: false,
      infoPlist: {
        // Location strings come from the expo-location plugin below (one source).
        UIBackgroundModes: ["location"],
      },
      // Required-reason APIs used by React Native and Expo core; the App Store
      // rejects uploads without them. Expo modules ship their own manifests,
      // this covers the app target.
      privacyManifests: {
        NSPrivacyAccessedAPITypes: [
          {
            NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults",
            NSPrivacyAccessedAPITypeReasons: ["CA92.1"],
          },
          {
            NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryFileTimestamp",
            NSPrivacyAccessedAPITypeReasons: ["C617.1"],
          },
          {
            NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategorySystemBootTime",
            NSPrivacyAccessedAPITypeReasons: ["35F9.1"],
          },
          {
            NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryDiskSpace",
            NSPrivacyAccessedAPITypeReasons: ["E174.1"],
          },
        ],
      },
    },

    // Driver app icons/splash are a M12c release task (assets don't exist yet).
    icon: undefined,
    android: {
      package: "com.nammalorry.driver",
      // The SecureStore session and the SQLite point queue must not leave the
      // device through Google or adb backup (docs/09 §4 "Session").
      allowBackup: false,
      // Android 13+ hides the trip notification without it, and Play's
      // background-location review expects that notification (docs/09 §2).
      // Location and foreground-service permissions come from expo-location.
      permissions: ["android.permission.POST_NOTIFICATIONS"],
      // Template defaults the app never uses (validation M3). Nothing calls the
      // vibrator directly; notification channels vibrate through the system.
      blockedPermissions: [
        "android.permission.SYSTEM_ALERT_WINDOW",
        "android.permission.VIBRATE",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
      ],
    },
    plugins: [
      "expo-router",
      "expo-sqlite",
      "expo-font",
      [
        "expo-location",
        {
          // docs/09 §3 — exact strings, unmodified.
          locationWhenInUsePermission: LOCATION_PERMISSION_WHEN_IN_USE,
          locationAlwaysAndWhenInUsePermission: LOCATION_PERMISSION_ALWAYS,
          // iOS < 11 key; without it Expo writes its generic default (M11).
          locationAlwaysPermission: LOCATION_PERMISSION_ALWAYS,
          // No motion APIs are used; `false` removes NSMotionUsageDescription
          // rather than shipping a generic string App Review asks about.
          motionUsagePermission: false,
          isIosBackgroundLocationEnabled: true,
          // D1 requests "Allow all the time" for the background task.
          isAndroidBackgroundLocationEnabled: true,
          // TRD §4.2 — the Android foreground service carries the persistent
          // notification while a trip is recording.
          isAndroidForegroundServiceEnabled: true,
          isAndroidMotionActivityEnabled: false,
        },
      ],
      // D1's notifications row: the Android foreground-service notification and
      // iOS's background-delivery alerts both land here.
      ["expo-notifications", {}],
      // Mappls is a native SDK → local config plugin applies the Android maven
      // repo + credential files and the iOS Podfile hook during prebuild (R1).
      ["./plugins/withMappls", { configDir: "mappls" }],
      // Sentry source-map upload at build time (B4). Only when the EAS secret
      // SENTRY_AUTH_TOKEN exists, so local and CI builds without it still work.
      ...(env.SENTRY_AUTH_TOKEN
        ? [
            [
              "@sentry/react-native/expo",
              { organization: env.SENTRY_ORG, project: env.SENTRY_PROJECT },
            ] as [string, Record<string, unknown>],
          ]
        : []),
    ],

    experiments: {
      // Web console is built from the same codebase (TRD §4.4).
      baseUrl: undefined,
    },

    web: {
      bundler: "metro",
      output: "single",
      favicon: undefined,
    },

    extra: {
      appEnv,
      eas: { projectId: EAS_PROJECT_ID },
    },

    _internal: {
      isDebug: appEnv === "development",
    },
  } as ExpoConfig;
};

/**
 * expo-task-manager's auto-applied plugin always adds the `fetch` background
 * mode. Trips are tracked through `location` only, and an unused background
 * mode draws App Review questions (validation M11).
 */
const withoutBackgroundFetch: ConfigPlugin = (config) =>
  withInfoPlist(config, (c) => {
    const modes = c.modResults.UIBackgroundModes as string[] | undefined;
    if (Array.isArray(modes)) c.modResults.UIBackgroundModes = modes.filter((m) => m !== "fetch");
    return c;
  });

/**
 * docs/09 §4 "HTTPS only" for release builds. Android 9+ already defaults
 * cleartext to off, but a library manifest can turn it on in the merge, so it
 * is set explicitly on <application>. On iOS, App Transport Security gets no
 * arbitrary loads and no localhost exception. Development keeps the defaults
 * so the dev client can reach Metro over http.
 */
const withHttpsOnlyInRelease =
  (appEnv: AppEnv): ConfigPlugin =>
  (config) => {
    if (appEnv === "development") return config;
    const withAndroid = withAndroidManifest(config, (c) => {
      const app = c.modResults.manifest.application?.[0];
      if (app) app.$["android:usesCleartextTraffic"] = "false";
      return c;
    });
    return withInfoPlist(withAndroid, (c) => {
      c.modResults.NSAppTransportSecurity = { NSAllowsArbitraryLoads: false };
      return c;
    });
  };

export function buildConfig(env: Env): ExpoConfig {
  const appEnv = appEnvFrom(env);
  return withHttpsOnlyInRelease(appEnv)(withoutBackgroundFetch(defineConfig(env)));
}

export default buildConfig(process.env);
