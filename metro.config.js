// https://docs.expo.dev/guides/customizing-metro/
// Sentry's wrapper around expo/metro-config's getDefaultConfig: adds debug IDs to bundles so
// uploaded source maps match the release (src/lib/sentry.ts).
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

// expo-sqlite on web (used only by the dev tracking screen) ships a .wasm build of SQLite
// that needs SharedArrayBuffer, i.e. a cross-origin isolated page.
config.resolver.assetExts.push('wasm');
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  return middleware(req, res, next);
};

module.exports = config;
