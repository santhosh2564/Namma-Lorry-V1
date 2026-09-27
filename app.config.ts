import type { ExpoConfig } from "expo/config";

/**
 * Namma Lorry — app configuration (M1 scaffold).
 *
 * Public runtime configuration comes from EXPO_PUBLIC_* env vars, validated in
 * src/lib/config.ts. Native permission strings and the expo-location plugin
 * (background location + foreground service) are configured in M9 — see
 * docs/09 §3 for the exact copy that will go here.
 */
const defineConfig = (): ExpoConfig => {
  const appEnv = process.env.EXPO_PUBLIC_APP_ENV ?? "development";

  return {
    name: "Namma Lorry",
    slug: "namma-lorry",
    scheme: "namma-lorry",
    version: "1.0.0",
    orientation: "portrait",
    userInterfaceStyle: "light",
    newArchEnabled: true,

    // Driver app icons/splash are a M12c release task (assets don't exist yet).
    icon: undefined,
    plugins: ["expo-router", "expo-sqlite", "expo-font"],

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

export default defineConfig();
