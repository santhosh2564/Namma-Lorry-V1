// Local auth settings (validation M4, PRD P0-1, ND-12): nobody can create an
// account by requesting an OTP. `[auth] enable_signup` is GoTrue's global
// DISABLE_SIGNUP; the admin API (provision-user, admin-create-driver) still
// creates users. `[auth.sms] enable_signup` is what the CLI uses to turn the
// phone provider on at all, so it must stay true or phone sign-in disappears.
// The hosted projects need the same setting in the dashboard (a human step,
// docs/release/README.md).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "..", "..");
const toml = readFileSync(join(root, "supabase", "config.toml"), "utf8");

/** `key = value` lines of one `[section]`, comments stripped. */
export function section(text, name) {
  const values = {};
  let current = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    const header = /^\[([^\]]+)\]$/.exec(line);
    if (header) {
      current = header[1];
      continue;
    }
    const kv = /^([\w.-]+)\s*=\s*(.+)$/.exec(line);
    if (kv && current === name) values[kv[1]] = kv[2].trim();
  }
  return values;
}

test("sign-ups are off: an OTP request cannot create an account", () => {
  assert.equal(section(toml, "auth").enable_signup, "false");
});

test("the phone provider stays on, so provisioned users can still sign in", () => {
  assert.equal(section(toml, "auth.sms").enable_signup, "true");
});

test("section() reads only the named section", () => {
  const sample = "[auth]\nenable_signup = false # off\n[auth.sms]\nenable_signup = true\n";
  assert.deepEqual(section(sample, "auth"), { enable_signup: "false" });
  assert.deepEqual(section(sample, "auth.sms"), { enable_signup: "true" });
});
