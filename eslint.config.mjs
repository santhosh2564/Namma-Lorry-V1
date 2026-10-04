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
      // Platform-split modules (`MapView.native.tsx` / `MapView.web.tsx`) have no
      // plain `.ts` sibling, so the resolver cannot see them.
      "import/no-unresolved": ["error", { ignore: ["\\./MapView$"] }],
      "import/no-named-as-default-member": "off",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "smart"],
    },
  },
  {
    // Deno Edge Functions import through `npm:` specifiers that the Node
    // resolver cannot follow. Deno resolves them at deploy time, and
    // `deno check` type-checks them, so the rule only produces false errors
    // here.
    files: ["supabase/functions/**/*.ts"],
    rules: {
      "import/no-unresolved": "off",
    },
  },
  {
    // `src/server/` holds code that uses server secrets (RESEND_API_KEY). The
    // app must never import it, or the secret-using code ships in the bundle.
    files: ["app/**/*.{ts,tsx}", "src/**/*.{ts,tsx}"],
    ignores: ["src/server/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "resend", message: "Email is sent server-side only (src/server/)." }],
          patterns: [
            {
              group: ["@/server", "@/server/*", "**/server/email", "**/server/email/*"],
              message: "src/server/ is server-only and must not be imported by the app.",
            },
          ],
        },
      ],
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
