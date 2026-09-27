/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  testMatch: ["**/__tests__/**/*.test.[jt]s?(x)", "**/?(*.)+(test).[jt]s?(x)"],
  testPathIgnorePatterns: ["/node_modules/", "/e2e/"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|i18next|react-i18next|zod|zustand)",
  ],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  collectCoverageFrom: ["src/**/*.{ts,tsx}", "!src/**/*.d.ts"],
};
