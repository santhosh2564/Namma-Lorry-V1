// Stub (B5c, failing-test commit): implemented in the fix.
export const APP_ENV_FOR_CHANNEL = {};
export function buildArgs() {
  throw new Error("not implemented");
}
export function checkClean() {
  throw new Error("not implemented");
}
export function childEnv() {
  throw new Error("not implemented");
}
if (process.argv[1]?.endsWith("eas-update.mjs")) process.exit(2);
