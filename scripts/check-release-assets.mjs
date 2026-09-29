// Stub (B5c, failing-test commit): implemented in the fix.
export const SPECS = [];
export function checkSpec() {
  throw new Error("not implemented");
}
export function readPng() {
  throw new Error("not implemented");
}
if (process.argv[1]?.endsWith("check-release-assets.mjs")) process.exit(2);
