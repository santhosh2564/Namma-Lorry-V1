// Initialise i18n exactly as app/_layout.tsx does, so components render real English strings.
import './src/i18n';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);

// RNTL 14 + React 19: tell React this is an act()-aware test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
