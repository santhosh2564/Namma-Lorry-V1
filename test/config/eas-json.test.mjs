// eas.json and EAS Update wiring (validation B5c). Each build profile maps to
// one update channel, one EAS environment (where `eas env:create` keeps the
// Supabase URL/key and the Sentry DSN) and one EXPO_PUBLIC_APP_ENV. No backend
// value is hardcoded here: since B5b a release build without them fails closed,
// so they must come from the EAS environment.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "..", "..");
const eas = JSON.parse(readFileSync(join(root, "eas.json"), "utf8"));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

/** A build profile with its `extends` chain applied (shallow, like EAS). */
function resolved(name) {
  const profile = eas.build[name];
  assert.ok(profile, `eas.json has no "${name}" profile`);
  const base = profile.extends ? resolved(profile.extends) : {};
  return {
    ...base,
    ...profile,
    env: { ...base.env, ...profile.env },
    android: { ...base.android, ...profile.android },
    ios: { ...base.ios, ...profile.ios },
  };
}

const EXPECTED = {
  development: { channel: "development", environment: "development", appEnv: "development" },
  preview: { channel: "preview", environment: "preview", appEnv: "staging" },
  preview_apk: { channel: "preview", environment: "preview", appEnv: "staging" },
  production: { channel: "production", environment: "production", appEnv: "production" },
};

for (const [name, want] of Object.entries(EXPECTED)) {
  test(`${name}: channel ${want.channel}, environment ${want.environment}, APP_ENV ${want.appEnv}`, () => {
    const p = resolved(name);
    assert.equal(p.channel, want.channel);
    assert.equal(p.environment, want.environment);
    assert.equal(p.env.EXPO_PUBLIC_APP_ENV, want.appEnv);
  });
}

test("preview is internal; preview_apk extends it and builds an installable APK", () => {
  assert.equal(resolved("preview").distribution, "internal");
  assert.equal(eas.build.preview_apk.extends, "preview");
  assert.equal(resolved("preview_apk").android.buildType, "apk");
});

test("no backend URL, key or DSN is hardcoded in any profile", () => {
  for (const name of Object.keys(eas.build)) {
    const keys = Object.keys(resolved(name).env);
    assert.deepEqual(keys, ["EXPO_PUBLIC_APP_ENV"], `${name} env: ${keys.join(", ")}`);
  }
  assert.doesNotMatch(JSON.stringify(eas), /supabase\.co|ingest\.sentry\.io|SERVICE_ROLE/i);
});

test("expo-updates is installed, so the app can receive what `eas update` publishes", () => {
  assert.ok(pkg.dependencies["expo-updates"], "expo-updates missing from dependencies");
});
