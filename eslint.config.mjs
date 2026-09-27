// @ts-check
import { defineConfig } from "eslint/config";
import expoConfig from "eslint-config-expo/flat.js";

/**
 * ESLint flat config for Namma Lorry.
 * Base: eslint-config-expo (flat), which already includes the import plugin.
 * Extras: import ordering, misc hygiene rules.
 */
export default defineConfig([
  expoConfig,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
        },
        node: true,
      },
    },
    rules: {
      "import/order": [
        "error",
        {
          groups: ["builtin", "external", ["internal", "parent", "sibling", "index"]],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "import/no-duplicates": "error",
      "import/no-named-as-default-member": "off",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "smart"],
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".expo/**",
      "dist/**",
      "web-build/**",
      "android/**",
      "ios/**",
      "coverage/**",
      "*.config.js",
      "babel.config.js",
      "jest.config.js",
    ],
  },
]);
