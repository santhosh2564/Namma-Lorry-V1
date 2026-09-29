// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// expo-sqlite's web worker imports `wa-sqlite.wasm`. Without `wasm` as an
// asset, `expo export -p web` fails (validation report B1).
config.resolver.assetExts.push("wasm");

module.exports = config;
