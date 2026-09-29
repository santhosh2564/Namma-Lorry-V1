// Mod-level app.config checks (validation report M3, M11; B5a). `expo config
// --type introspect` runs every config plugin without a prebuild, so these see
// the merged Android manifest and iOS Info.plist the native build would get.
// The Info.plist is Expo's template plus the mods; the final plist from a macOS
// prebuild still needs checking once (report M11 "NOT VERIFIABLE on Windows").
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "..", "..");
const expoCli = join(root, "node_modules", "expo", "bin", "cli");

const ALWAYS =
  "Namma Lorry records your route in the background only while a trip you started is in progress, so your driving experience can be verified.";

const BLOCKED = [
  "android.permission.SYSTEM_ALERT_WINDOW",
  "android.permission.VIBRATE",
  "android.permission.READ_EXTERNAL_STORAGE",
  "android.permission.WRITE_EXTERNAL_STORAGE",
];

function introspect(appEnv) {
  const res = spawnSync(process.execPath, [expoCli, "config", "--type", "introspect", "--json"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, EXPO_PUBLIC_APP_ENV: appEnv, SENTRY_AUTH_TOKEN: "" },
  });
  assert.equal(res.status, 0, res.stderr);
  return JSON.parse(res.stdout)._internal.modResults;
}

function permissionNodes(manifest) {
  return (manifest.manifest["uses-permission"] ?? []).map((p) => p.$);
}

for (const appEnv of ["staging", "production"]) {
  test(`${appEnv}: Android manifest is locked down`, () => {
    const { manifest } = introspect(appEnv).android;
    const app = manifest.manifest.application[0].$;
    assert.equal(app["android:allowBackup"], "false");
    assert.equal(app["android:usesCleartextTraffic"], "false");

    const perms = permissionNodes(manifest);
    for (const name of BLOCKED) {
      const node = perms.find((p) => p["android:name"] === name);
      assert.ok(node, `${name} must be listed so the manifest merger removes it`);
      assert.equal(node["tools:node"], "remove", `${name} must be tools:node="remove"`);
    }
    assert.ok(
      perms.some((p) => p["android:name"] === "android.permission.POST_NOTIFICATIONS"),
      "POST_NOTIFICATIONS is requested",
    );
  });

  test(`${appEnv}: iOS Info.plist matches docs/09 §3`, () => {
    const plist = introspect(appEnv).ios.infoPlist;
    assert.deepEqual(plist.UIBackgroundModes, ["location"]);
    assert.equal(plist.NSLocationAlwaysUsageDescription, ALWAYS);
    assert.equal(plist.NSLocationAlwaysAndWhenInUseUsageDescription, ALWAYS);
    assert.equal(plist.NSMotionUsageDescription, undefined);
    assert.notEqual(plist.NSAppTransportSecurity?.NSAllowsArbitraryLoads, true);
  });
}

test("development: cleartext not forced off (the dev client reaches Metro over http)", () => {
  const mods = introspect("development");
  const app = mods.android.manifest.manifest.application[0].$;
  assert.notEqual(app["android:usesCleartextTraffic"], "false");
  assert.deepEqual(mods.ios.infoPlist.UIBackgroundModes, ["location"]);
});
