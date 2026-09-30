// Re-consent (migration 0009, docs/09 §1): the policy version lives in two
// places that must agree, and the D1 notice repeats facts from the policy.
//   - public.current_consent_version() (latest migration that defines it)
//     = CONSENT_VERSION in src/features/onboarding/consent.ts
//   - D1's retention line says the policy's retention period
//   - EXPO_PUBLIC_PRIVACY_POLICY_URL (D1's policy link) is wired and documented
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "..", "..");
const read = (path) => readFileSync(join(root, path), "utf8");

function appConsentVersion() {
  const match = /export const CONSENT_VERSION = "([^"]+)";/.exec(
    read("src/features/onboarding/consent.ts"),
  );
  assert.ok(match, "CONSENT_VERSION not found in consent.ts");
  return match[1];
}

/** The version returned by the last migration that (re)defines the function. */
function databaseConsentVersion() {
  const dir = "supabase/migrations";
  const pattern =
    /create or replace function public\.current_consent_version\(\)[\s\S]*?\$\$\s*select\s+'([^']+)'/gi;
  let version = null;
  for (const file of readdirSync(join(root, dir)).sort()) {
    for (const match of read(join(dir, file)).matchAll(pattern)) {
      version = match[1];
    }
  }
  return version;
}

test("current_consent_version() in the database = CONSENT_VERSION in the app", () => {
  const db = databaseConsentVersion();
  assert.ok(db, "no migration defines public.current_consent_version()");
  assert.equal(db, appConsentVersion());
});

test("D1's retention line says the privacy policy's retention period", () => {
  const policyMonths = /\*\*Raw GPS points:\*\* (\d+) months/.exec(
    read("docs/release/PRIVACY_POLICY.md"),
  );
  assert.ok(policyMonths, "retention period not found in PRIVACY_POLICY.md");
  const en = JSON.parse(read("src/i18n/en.json"));
  const line = en.onboarding?.permissions?.disclosure?.retention;
  assert.equal(typeof line, "string", "onboarding.permissions.disclosure.retention missing in en");
  assert.match(line, new RegExp(`\\b${policyMonths[1]} months\\b`));
});

test("EXPO_PUBLIC_PRIVACY_POLICY_URL is read literally and documented", () => {
  const name = "EXPO_PUBLIC_PRIVACY_POLICY_URL";
  assert.ok(
    read("src/lib/config.ts").includes(`process.env.${name}`),
    "config.ts must reference it literally (Metro inlining)",
  );
  for (const doc of ["env.example", "docs/DEV_SETUP.md", "docs/release/README.md"]) {
    assert.ok(read(doc).includes(name), `${doc} must mention ${name}`);
  }
});
