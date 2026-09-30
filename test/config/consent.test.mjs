// Re-consent (0009, docs/09 §1): the policy version the database accepts and
// the one compiled into each app build must never drift. The app records
// CONSENT_VERSION through record_consent, which accepts only
// public.current_consent_version(); if the two differ an installed build either
// loops on D1 or silently keeps an old agreement, so the config suite pins them
// together until a deliberate, ordered release changes both.
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
