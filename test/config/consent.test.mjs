// Re-consent (0009/0010, docs/09 §1): the policy version the database holds and
// the one compiled into each app build must never drift. The app records
// CONSENT_VERSION through record_consent, which accepts the database's
// public.current_consent_version() or a newer one (0010); if the database moved
// past the app, installed builds are told to update, and if the app is ahead
// for good, nobody is ever re-prompted. The config suite pins them together
// until a deliberate, ordered release changes both (docs/RUNBOOK.md).
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

function migrations() {
  const dir = join(root, "supabase", "migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((file) => ({ file, sql: readFileSync(join(dir, file), "utf8") }));
}

/**
 * The consent_version row's value after every migration has run: 0009 inserts
 * it, and a version bump is a later `update … set value_text = '…'` (RUNBOOK),
 * so the LAST setting wins, not the first.
 */
function databaseVersion(files) {
  const insert = /'consent_version',\s*0,[\s\S]*?'(\d{4}-\d{2}-\d{2})'/g;
  const update =
    /update\s+public\.app_settings\s+set\s+value_text\s*=\s*'([^']+)'\s+where\s+key\s*=\s*'consent_version'/gi;
  let version = null;
  for (const { sql } of files) {
    const hits = [...sql.matchAll(insert), ...sql.matchAll(update)].sort(
      (a, b) => a.index - b.index,
    );
    for (const hit of hits) version = hit[1];
  }
  return version;
}

/** The body of the last migration that (re)defines public.<name>(. */
function latestDefinition(files, name) {
  const pattern = new RegExp(
    `create or replace function public\\.${name}\\([\\s\\S]*?\\nend \\$\\$;`,
    "gi",
  );
  let latest = null;
  for (const { file, sql } of files) {
    for (const match of sql.matchAll(pattern)) latest = { file, body: match[0] };
  }
  return latest;
}

test("the database's current consent version equals CONSENT_VERSION", () => {
  assert.match(consentVersion(), /^\d{4}-\d{2}-\d{2}$/);
  const version = databaseVersion(migrations());
  assert.ok(version, "no app_settings('consent_version') row in supabase/migrations");
  assert.equal(version, consentVersion());
});

test("negative control: a later version bump wins over the 0009 insert", () => {
  const files = [
    {
      file: "0009.sql",
      sql: "insert into public.app_settings(key, value, note, value_text) values\n  ('consent_version', 0,\n   'note', '2026-10-01');",
    },
    {
      file: "0042.sql",
      sql: "update public.app_settings set value_text = '2027-04-01' where key = 'consent_version';",
    },
  ];
  assert.equal(databaseVersion(files), "2027-04-01");
});

test("the latest start_trip and record_consent still check the consent version", () => {
  // Behaviour is pinned by pgTAP (suites 10 and 11); this catches a later
  // redefinition that drops the check altogether.
  const files = migrations();
  for (const [name, needle] of [
    ["start_trip", "'CONSENT_REQUIRED'"],
    ["record_consent", "'VERSION_NOT_CURRENT'"],
  ]) {
    const latest = latestDefinition(files, name);
    assert.ok(latest, `no migration defines public.${name}`);
    assert.ok(
      latest.body.includes("public.current_consent_version()"),
      `${latest.file}: ${name} no longer compares with current_consent_version()`,
    );
    assert.ok(latest.body.includes(needle), `${latest.file}: ${name} no longer raises ${needle}`);
  }
});
