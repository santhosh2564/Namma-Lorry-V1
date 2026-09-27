// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'namma-lorry-phase1-docs/*', 'SCREENS/*', 'supabase/*', 'src/lib/database.types.ts'],
  },
]);
