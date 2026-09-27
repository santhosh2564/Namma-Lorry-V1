// eslint-config-expo ships no TypeScript types for its flat-config entry.
declare module "eslint-config-expo/flat.js" {
  import type { Linter } from "eslint";

  export const flatConfig: Linter.Config[];
  export default flatConfig;
}
