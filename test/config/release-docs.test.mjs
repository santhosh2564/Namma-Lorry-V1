// Release pack (validation B5e): docs/release/* and docs/RUNBOOK.md must stay
// true to the code. The privacy-policy version is the one D1 records, ASSETS.md
// describes exactly what scripts/check-release-assets.mjs checks, and the
// runbook names only package scripts, SQL functions and files that exist.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { SPECS } from "../../scripts/check-release-assets.mjs";

const root = join(import.meta.dirname, "..", "..");
const read = (path) => readFileSync(join(root, path), "utf8");

export const RELEASE_DOCS = [
  "README.md",
  "PRIVACY_POLICY.md",
  "DATA_SAFETY.md",
  "APP_PRIVACY.md",
  "BACKGROUND_LOCATION.md",
  "APP_REVIEW_NOTES.md",
  "ASSETS.md",
];

/** CONSENT_VERSION as written in consent.ts (a TS file, so read, not imported). */
function consentVersion() {
  const match = /export const CONSENT_VERSION = "([^"]+)";/.exec(
    read("src/features/onboarding/consent.ts"),
  );
  assert.ok(match, "CONSENT_VERSION not found in src/features/onboarding/consent.ts");
  return match[1];
}

/** `**Version:** `x`` lines in the policy. */
const policyVersions = (text) => [...text.matchAll(/\*\*Version:\*\* `([^`]+)`/g)].map((m) => m[1]);

/** The text ASSETS.md must show for a spec's size and transparency. */
export function sizeText(spec) {
  if (spec.w) return `${spec.w}×${spec.h}`;
  return `≥ ${spec.min}×${spec.min}${spec.square ? ", square" : ""}`;
}
export function alphaText(spec) {
  if (spec.alpha === true) return "required";
  if (spec.alpha === false) return "not allowed";
  return "either";
}

/** Rows of the ASSETS.md table whose first cell is a backticked assets/ path. */
export function assetRows(markdown) {
  const rows = new Map();
  for (const line of markdown.split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    const file = /^`(assets\/[^`]+)`$/.exec(cells[1] ?? "");
    if (file) rows.set(file[1], cells.slice(2, -1));
  }
  return rows;
}

/**
 * Every script, SQL function and repo path a runbook names, so each can be
 * checked against package.json, the migrations and the file tree.
 */
export function runbookReferences(markdown) {
  const scripts = new Set(
    [...markdown.matchAll(/\b(?:bun|npm) run ([a-z][\w:-]*)/g)].map((m) => m[1]),
  );
  const functions = new Set([...markdown.matchAll(/\bpublic\.([a-z_]+)\s*\(/g)].map((m) => m[1]));
  const paths = new Set(
    [...markdown.matchAll(/`((?:scripts|src|app|supabase|docs|test)\/[^`\s<>*]+)`/g)].map(
      (m) => m[1],
    ),
  );
  return { scripts, functions, paths };
}

function definedFunctions() {
  const dir = join(root, "supabase", "migrations");
  const names = new Set();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
    const sql = readFileSync(join(dir, file), "utf8");
    for (const m of sql.matchAll(/create (?:or replace )?function public\.([a-z_]+)\s*\(/g)) {
      names.add(m[1]);
    }
  }
  return names;
}

const packageScripts = () => new Set(Object.keys(JSON.parse(read("package.json")).scripts));

/** Unknown references (empty = all real). */
export function missingReferences(refs, { scripts, functions, exists }) {
  return [
    ...[...refs.scripts].filter((s) => !scripts.has(s)).map((s) => `script "${s}"`),
    ...[...refs.functions].filter((f) => !functions.has(f)).map((f) => `function public.${f}`),
    ...[...refs.paths].filter((p) => !exists(p)).map((p) => `path ${p}`),
  ];
}

const repo = () => ({
  scripts: packageScripts(),
  functions: definedFunctions(),
  exists: (p) => existsSync(join(root, p)),
});

test("every release doc exists and the README links each one", () => {
  for (const doc of RELEASE_DOCS) {
    const path = join("docs", "release", doc);
    assert.ok(existsSync(join(root, path)), `${path} is missing`);
    assert.ok(read(path).trim().length > 200, `${path} is empty`);
  }
  const readme = read("docs/release/README.md");
  for (const doc of RELEASE_DOCS.filter((d) => d !== "README.md")) {
    assert.ok(readme.includes(`](${doc})`), `README.md does not link ${doc}`);
  }
});

test("privacy policy: draft header, docs/09 §6 sections, version = CONSENT_VERSION", () => {
  const policy = read("docs/release/PRIVACY_POLICY.md");
  assert.match(policy.split("\n")[0], /Requires legal review before publishing/);

  const headings = [...policy.matchAll(/^## (.+)$/gm)].map((m) => m[1].toLowerCase());
  for (const section of [
    "who we are",
    "data we collect",
    "purpose",
    "legal basis",
    "sharing",
    "retention",
    "security",
    "your rights",
    "grievance officer",
    "changes",
  ]) {
    assert.ok(
      headings.some((h) => h.includes(section)),
      `no "## …${section}…" section (docs/09 §6)`,
    );
  }

  const versions = policyVersions(policy);
  assert.ok(versions.length > 0, "no **Version:** `…` line");
  assert.deepEqual([...new Set(versions)], [consentVersion()]);
  // Retention matches the job 0006 schedules (365 days, pending sign-off).
  assert.match(policy, /12 months/);
  assert.match(read("supabase/migrations/0006_dpdp_controls.sql"), /raw_point_retention_days/);
});

test("CONSENT_VERSION is a policy version string (YYYY-MM-DD)", () => {
  assert.match(consentVersion(), /^\d{4}-\d{2}-\d{2}$/);
});

test("ASSETS.md lists exactly the SPECS files, with their sizes and transparency", () => {
  const rows = assetRows(read("docs/release/ASSETS.md"));
  assert.deepEqual([...rows.keys()].sort(), SPECS.map((s) => s.file).sort());
  for (const spec of SPECS) {
    const [size, alpha, configField] = rows.get(spec.file);
    assert.equal(size, sizeText(spec), `${spec.file} size`);
    assert.equal(alpha, alphaText(spec), `${spec.file} transparency`);
    assert.match(configField, /`[\w.[\]"-]+`/, `${spec.file}: which app.config field`);
  }
});

test("runbook keeps Erasure and has the operational sections", () => {
  const runbook = read("docs/RUNBOOK.md");
  const headings = [...runbook.matchAll(/^## (.+)$/gm)].map((m) => m[1].toLowerCase());
  for (const section of [
    "deploy",
    "rollback",
    "key rotation",
    "stuck trip",
    "re-run verification",
    "data incident",
    "erasure",
  ]) {
    assert.ok(
      headings.some((h) => h.includes(section)),
      `RUNBOOK.md has no "## …${section}…" section`,
    );
  }
  for (const rpc of ["admin_force_end", "cancel_trip", "verify_trip", "admin_erase_driver"]) {
    assert.ok(runbook.includes(`public.${rpc}(`), `RUNBOOK.md does not call public.${rpc}`);
  }
});

test("runbook and release docs name only scripts, SQL functions and files that exist", () => {
  for (const path of ["docs/RUNBOOK.md", ...RELEASE_DOCS.map((d) => `docs/release/${d}`)]) {
    if (!existsSync(join(root, path))) assert.fail(`${path} is missing`);
    assert.deepEqual(missingReferences(runbookReferences(read(path)), repo()), [], path);
  }
});

test("negative control: the reference check catches made-up names", () => {
  const refs = runbookReferences(
    "bun run deploy:all · `select public.force_verify('x')` · see `scripts/rollback.mjs`",
  );
  assert.deepEqual(missingReferences(refs, repo()), [
    'script "deploy:all"',
    "function public.force_verify",
    "path scripts/rollback.mjs",
  ]);
  // …and passes real ones.
  const real = runbookReferences(
    "bun run update:production · public.verify_trip(id) · `scripts/eas-update.mjs`",
  );
  assert.deepEqual(missingReferences(real, repo()), []);
});
