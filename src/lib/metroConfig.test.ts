/**
 * @jest-environment node
 */
import fs from "node:fs";
import path from "node:path";

// Validation report B1: `expo export -p web` failed with
// "Unable to resolve module ./wa-sqlite/wa-sqlite.wasm" because Metro's default
// asset list has no `wasm`. expo-sqlite's web worker imports that file, and the
// driver routes pull expo-sqlite into the web graph via `@/tracking/db`.
describe("metro.config.js", () => {
  const root = path.resolve(__dirname, "../..");

  // Loading the config loads Metro and Expo's Metro config, which is genuinely
  // slow (up to 11 s on a cold transform cache), so it happens once, here, under
  // its own limit instead of inside a test's 5 s timeout.
  let config: { resolver: { assetExts: string[]; sourceExts: string[] } };
  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    config = require(path.join(root, "metro.config.js"));
  }, 60_000);

  it("exists at the project root", () => {
    expect(fs.existsSync(path.join(root, "metro.config.js"))).toBe(true);
  });

  it("treats .wasm as an asset so expo-sqlite's web worker bundles", () => {
    expect(config.resolver.assetExts).toContain("wasm");
    // The file the worker imports really is a .wasm asset (guards against the
    // dependency renaming it and this test passing for the wrong reason).
    const worker = fs.readFileSync(
      path.join(root, "node_modules/expo-sqlite/web/worker.ts"),
      "utf8",
    );
    expect(worker).toMatch(/wa-sqlite\.wasm/);
  });

  it("keeps Expo's default source extensions", () => {
    expect(config.resolver.sourceExts).toEqual(expect.arrayContaining(["ts", "tsx", "js"]));
    expect(config.resolver.sourceExts).not.toContain("wasm");
  });
});
