import type { ExpoConfig } from 'expo/config';

// Only EXPO_PUBLIC_* variables reach the bundle (CLAUDE.md rule 6). They are read and
// validated at runtime in src/lib/config.ts, not here.

// Permission text from docs/09 §3 (store review reads these; keep them in sync with D1).
const WHEN_IN_USE =
  'Namma Lorry uses your location to start and end trips at the pickup and delivery points.';
const ALWAYS =
  'Namma Lorry records your route in the background only while a trip you started is in progress, so your driving experience can be verified.';

// Sentry source-map upload on EAS builds: only when org/project are set (SENTRY_AUTH_TOKEN is an
// EAS secret). The DSN itself is EXPO_PUBLIC_SENTRY_DSN, read at runtime (src/lib/sentry.ts).
const sentryPlugin: NonNullable<ExpoConfig['plugins']> =
  process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
    ? [
        [
          '@sentry/react-native/expo',
          { organization: process.env.SENTRY_ORG, project: process.env.SENTRY_PROJECT },
        ],
      ]
    : [];

const config: ExpoConfig = {
  name: 'Namma Lorry',
  slug: 'namma-lorry',
  scheme: 'namma-lorry',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    supportsTablet: true,
    infoPlist: {
      NSLocationWhenInUseUsageDescription: WHEN_IN_USE,
      NSLocationAlwaysAndWhenInUseUsageDescription: ALWAYS,
      NSLocationAlwaysUsageDescription: ALWAYS,
      UIBackgroundModes: ['location'],
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#0F2A44',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: { favicon: './assets/favicon.png', output: 'single', bundler: 'metro' },
  plugins: [
    'expo-router',
    [
      'expo-location',
      {
        locationWhenInUsePermission: WHEN_IN_USE,
        locationAlwaysAndWhenInUsePermission: ALWAYS,
        locationAlwaysPermission: ALWAYS,
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    // POST_NOTIFICATIONS (Android 13+) for the tracking notification; asked on D1.
    'expo-notifications',
    'expo-sqlite',
    'expo-secure-store',
    'expo-font',
    [
      'expo-splash-screen',
      { backgroundColor: '#0F2A44', image: './assets/splash-icon.png', imageWidth: 160 },
    ],
    ...sentryPlugin,
  ],
  experiments: { typedRoutes: false },
};

export default config;
