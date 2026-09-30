// Re-consent (0009/0010, docs/09 §1): the policy version the database accepts
// and the one compiled into each app build must never drift. The app records
// CONSENT_VERSION through record_consent, which accepts
// public.current_consent_version() or a newer one (0010, so the app can ship
// first); if the two differ an installed build either loops on D1 or silently
// keeps an old agreement, so the config suite pins them together until a
// deliberate, ordered release changes both. It also pins two facts D1 repeats
// from the policy: the retention period, and the policy link's env var.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "..", "..");
const read = (path) => readFileSync(join(root, path), "utf8");

/** CONSENT_VERSION as written in consent.ts (a TS file, so read, not imported). */
function consentVersion() {
  const match = /export const CONSENT_VERSION = "([^"]+)";/.exec(
    read("src/features/onboarding/consent.ts"),
  );
  assert.ok(match, "CONSENT_VERSION not found in src/features/onboarding/consent.ts");
  return match[1];
}

/** The `consent_version` row seeded by a migration (its text `value_text`). */
function databaseVersion() {
  const dir = join(root, "supabase", "migrations");
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const sql = readFileSync(join(dir, file), "utf8");
    const match = /'consent_version',\s*0,[\s\S]*?'(\d{4}-\d{2}-\d{2})'/.exec(sql);
    if (match) return match[1];
  }
  assert.fail("no app_settings('consent_version') row in supabase/migrations");
}

test("the database's current consent version equals CONSENT_VERSION", () => {
  assert.match(consentVersion(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(databaseVersion(), consentVersion());
});

test("0009 defines the version gate the client and start_trip rely on", () => {
  const sql = read("supabase/migrations/0009_reconsent_notice.sql");
  assert.match(sql, /create or replace function public\.current_consent_version\(\)/);
  // record_consent refuses a version that is not current…
  assert.match(sql, /VERSION_NOT_CURRENT/);
  // …and start_trip treats a stale version as no consent.
  assert.match(sql, /raise exception 'CONSENT_REQUIRED'/);
  assert.match(sql, /consent_version = public\.current_consent_version\(\)/);
});

test("0010 accepts the current or a newer version, older-first (collate 'C')", () => {
  const sql = read("supabase/migrations/0010_consent_newer_version.sql");
  // Versions are YYYY-MM-DD text compared byte-for-byte.
  assert.match(sql, /collate "C"/);
  // The older-than-current refusal comes before the format check, so a pre-0009
  // build's dotted version reads as outdated rather than malformed.
  const older = sql.indexOf("raise exception 'VERSION_NOT_CURRENT'");
  const format = sql.indexOf("!~");
  assert.ok(older !== -1, "0010 must still refuse an older version as VERSION_NOT_CURRENT");
  assert.ok(format !== -1, "0010 must add a YYYY-MM-DD format check after it");
  assert.ok(older < format, "the older-than-current check must run before the format check");
  assert.match(sql, /VERSION_INVALID/);
  // start_trip accepts a newer version, not only the current one.
  assert.match(sql, /consent_version\s+collate "C"\s*>=\s*public\.current_consent_version\(\)/);
});

test("D1's retention line says the privacy policy's retention period", () => {
  const policyMonths = /\*\*Raw GPS points:\*\* (\d+) months/.exec(
    read("docs/release/PRIVACY_POLICY.md"),
  );
  assert.ok(policyMonths, "retention period not found in docs/release/PRIVACY_POLICY.md");
  const en = JSON.parse(read("src/i18n/en.json"));
  const line = en.onboarding?.permissions?.retention;
  assert.equal(typeof line, "string", "onboarding.permissions.retention missing in en");
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
