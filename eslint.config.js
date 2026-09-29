// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettier = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  prettier,
  {
    ignores: [
      'dist/*',
      'node_modules/*',
      '.expo/*',
      'docs/**',
      'supabase/**',
      'design/**',
      'test/**',
      'namma-lorry-phase1-docs/**',
      'SCREENS/**',
      'babel.config.js',
      'eslint.config.js',
      'app.config.ts',
    ],
  },
  {
    // jest.mock factories must use require(); babel-jest hoists mocks above imports.
    files: ['**/__tests__/**', 'jest.setup.ts'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    // TRD §4.2 / M12a: the background location task only writes to SQLite. Network I/O
    // belongs to the uploader (foreground), never the task — enforced here before M8 lands.
    files: ['src/tracking/task.ts', 'src/tracking/task.*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: '@supabase/supabase-js', message: 'No network I/O in the background task (TRD §4.2).' },
            { name: '@/lib/supabase', message: 'No network I/O in the background task (TRD §4.2).' },
            { name: '@react-native-community/netinfo', message: 'The task never checks or uses the network.' },
          ],
          patterns: [
            { group: ['**/uploader', '**/uploader.*'], message: 'Uploads run from the foreground uploader, not the task.' },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'No network I/O in the background task (TRD §4.2).' },
        { name: 'XMLHttpRequest', message: 'No network I/O in the background task (TRD §4.2).' },
        { name: 'WebSocket', message: 'No network I/O in the background task (TRD §4.2).' },
      ],
    },
  },
]);
