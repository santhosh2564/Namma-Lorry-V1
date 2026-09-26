import type { ExpoConfig } from 'expo/config';

// Only EXPO_PUBLIC_* variables reach the bundle (CLAUDE.md rule 6). They are read and
// validated at runtime in src/lib/config.ts, not here.
const config: ExpoConfig = {
  name: 'Namma Lorry',
  slug: 'namma-lorry',
  scheme: 'namma-lorry',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: { supportsTablet: true },
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
    'expo-secure-store',
    'expo-font',
    ['expo-splash-screen', { backgroundColor: '#0F2A44', image: './assets/splash-icon.png', imageWidth: 160 }],
  ],
  experiments: { typedRoutes: false },
};

export default config;
