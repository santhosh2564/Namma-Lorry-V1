// Validation B5c: provision-user changes role/language/is_active ONLY when the
// flag is passed, supports --activate, and anchors the localhost exception to
// the URL host.
import assert from "node:assert/strict";
import { test } from "node:test";

import { parseFlags, profileUpdate, provision, validateUrl } from "../provision-user.mjs";

/** Records calls; `existing` is the profile row the lookup returns (or null). */
function fakeClient({ existing = null, createErr = null, updateErr = null } = {}) {
  const calls = { created: [], updates: [] };
  const client = {
    from: (table) => {
      assert.equal(table, "profiles");
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: existing, error: null }) }),
        }),
        update: (row) => ({
          eq: async (col, id) => {
            calls.updates.push({ row, col, id });
            return { error: updateErr };
          },
        }),
      };
    },
    auth: {
      admin: {
        createUser: async (args) => {
          calls.created.push(args);
          return createErr
            ? { data: null, error: createErr }
            : { data: { user: { id: "new-id" } }, error: null };
        },
      },
    },
  };
  return { client, calls };
}

const flags = (...argv) => parseFlags(["--phone", "919876543210", ...argv]);

test("existing user + no flags → nothing is changed", async () => {
  const { client, calls } = fakeClient({ existing: { id: "u1" } });
  const res = await provision({ values: flags(), client });
  assert.equal(res.created, false);
  assert.deepEqual(calls.updates, []);
});

test("existing user + --role admin → only role is updated", async () => {
  const { client, calls } = fakeClient({ existing: { id: "u1" } });
  await provision({ values: flags("--role", "admin"), client });
  assert.deepEqual(calls.updates, [{ row: { role: "admin" }, col: "id", id: "u1" }]);
});

test("existing user + --name → only full_name is updated (is_active untouched)", async () => {
  const { client, calls } = fakeClient({ existing: { id: "u1" } });
  await provision({ values: flags("--name", "Murugan S"), client });
  assert.deepEqual(calls.updates[0].row, { full_name: "Murugan S" });
});

test("--activate / --deactivate set is_active; both together is an error", () => {
  assert.deepEqual(profileUpdate(flags("--activate"), { isNew: false }), { is_active: true });
  assert.deepEqual(profileUpdate(flags("--deactivate"), { isNew: false }), { is_active: false });
  assert.throws(() => profileUpdate(flags("--activate", "--deactivate"), { isNew: false }), /both/);
});

test("--language only when passed", () => {
  assert.deepEqual(profileUpdate(flags("--language", "ta"), { isNew: false }), {
    preferred_language: "ta",
  });
});

test("new user gets the documented defaults: driver, en, active", async () => {
  const { client, calls } = fakeClient();
  const res = await provision({ values: flags(), client });
  assert.equal(res.created, true);
  assert.deepEqual(calls.created, [{ phone: "919876543210", phone_confirm: true }]);
  assert.deepEqual(calls.updates[0].row, {
    role: "driver",
    preferred_language: "en",
    is_active: true,
  });
});

test("new user honours explicit flags", async () => {
  const { client, calls } = fakeClient();
  await provision({ values: flags("--role", "admin", "--deactivate", "--language", "hi"), client });
  assert.deepEqual(calls.updates[0].row, {
    role: "admin",
    preferred_language: "hi",
    is_active: false,
  });
});

test("bad role / language / phone are rejected before any call", async () => {
  const { client, calls } = fakeClient();
  await assert.rejects(provision({ values: flags("--role", "root"), client }), /--role/);
  await assert.rejects(provision({ values: flags("--language", "fr"), client }), /--language/);
  await assert.rejects(provision({ values: parseFlags(["--phone", "12345"]), client }), /--phone/);
  assert.equal(calls.created.length + calls.updates.length, 0);
});

test("URL validation is anchored to the host", () => {
  assert.equal(validateUrl("https://abc.supabase.co"), null);
  assert.equal(validateUrl("http://localhost:54321"), null);
  assert.equal(validateUrl("http://127.0.0.1:54321"), null);
  for (const bad of [
    "http://abc.supabase.co",
    "http://evil.com/?localhost",
    "http://evil.com/127.0.0.1",
    "http://localhost.evil.com",
    "http://127.0.0.1.nip.io",
    "not a url",
    "",
  ]) {
    assert.notEqual(validateUrl(bad), null, bad);
  }
});
