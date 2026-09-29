import type { ExpoConfig } from "expo/config";

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
 */
const LOCATION_PERMISSION_WHEN_IN_USE =
  "Namma Lorry uses your location to start and end trips at the pickup and delivery points.";
const LOCATION_PERMISSION_ALWAYS =
  "Namma Lorry records your route in the background only while a trip you started is in progress, so your driving experience can be verified.";

type Env = Record<string, string | undefined>;

export function appEnvFrom(env: Env): string {
  return env.EXPO_PUBLIC_APP_ENV ?? "development";
}

const defineConfig = (env: Env): ExpoConfig => {
  const appEnv = appEnvFrom(env);

  return {
    name: "Namma Lorry",
    slug: "namma-lorry",
    scheme: "namma-lorry",
    version: "1.0.0",
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
        UIBackgroundModes: ["location"],
      },
    },

    // Driver app icons/splash are a M12c release task (assets don't exist yet).
    icon: undefined,
    android: { package: "com.nammalorry.driver" },
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
          // D1 requests "Allow all the time" for the background task.
          isAndroidBackgroundLocationEnabled: true,
          // TRD §4.2 — the Android foreground service carries the persistent
          // notification while a trip is recording.
          isAndroidForegroundServiceEnabled: true,
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
    },

    _internal: {
      isDebug: appEnv === "development",
    },
  } as ExpoConfig;
};

export function buildConfig(env: Env): ExpoConfig {
  return defineConfig(env);
}

export default buildConfig(process.env);
