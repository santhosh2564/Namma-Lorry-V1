import type { ExpoConfig } from 'expo/config';

/**
 * Namma Lorry — Expo app config (M1).
 * Reads EXPO_PUBLIC_* env vars; secrets are NEVER referenced here.
 * Tracking/map native config lands in M3 (plugins/withMappls.ts) and M9
 * (expo-location foreground service + permission strings, doc 09 §3).
 */
const defineConfig = (): ExpoConfig => {
  const appEnv = (process.env.EXPO_PUBLIC_APP_ENV ?? 'development') as
    | 'development'
    | 'preview'
    | 'production';

  return {
    name: 'Namma Lorry',
    slug: 'namma-lorry',
    scheme: 'namma-lorry',
    version: '0.1.0',
    orientation: 'portrait',
    userInterfaceStyle: 'light',

    // Placeholder asset until M12c (design/ has no icon yet). Splash config
    // arrives with expo-splash-screen in M2 (top-level `splash` is gone in SDK 57).
    icon: './assets/icon.png',

    ios: {
      bundleIdentifier: 'com.nammalorry.app',
      supportsTablet: false,
      infoPlist: {
        // Permission strings are finalised from doc 09 §3 in M9.
        NSLocationWhenInUseUsageDescription:
          'Namma Lorry records your GPS position during an assigned trip so your trip can be verified.',
        NSLocationAlwaysAndWhenInUseUsageDescription:
          'Namma Lorry records your GPS position during an assigned trip so your trip can be verified.',
        UIBackgroundModes: ['location'],
      },
    },

    android: {
      package: 'com.nammalorry.app',
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#0F2A44',
      },
      // expo-location foreground service config is added in M9.
    },

    web: {
      bundler: 'metro',
      output: 'single',
      favicon: './assets/favicon.png',
    },

    // expo-keep-awake is installed as a dependency but NOT a config plugin:
    // it ships no app.plugin.js, and on Node >=22 loading its TS main entry
    // fails (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`). Its optional
    // keep-awake setting lands in M10 and needs no plugin.
    plugins: ['expo-router', 'expo-font'],

    experiments: {
      typedRoutes: false,
    },

    extra: {
      appEnv,
      eas: {
        projectId: '00000000-0000-0000-0000-000000000000', // replace at first `eas build` (M3)
      },
    },
  };
};

export default defineConfig();
