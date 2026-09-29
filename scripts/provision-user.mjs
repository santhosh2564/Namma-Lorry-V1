#!/usr/bin/env node
/**
 * Operator tool (validation B5c): create or update a phone-login user on a
 * HOSTED Supabase project. Drivers are registered by an admin, not by sign-up
 * (ND-12), so the admin, pilot drivers and the App Review demo account are
 * provisioned here (docs/DEV_SETUP.md §5.1).
 *
 *   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<secret key> \
 *     bun run provision-user --phone 919876543210 --name "Murugan S" --role driver
 *
 * Existing users: ONLY the flags you pass change — `--name` alone never touches the
 * role or reactivates a deactivated driver. New users default to driver / en / active.
 * Flags: --phone (required) --name --role driver|admin|owner|shipper --language en|ta|kn|hi
 *        --activate | --deactivate
 *
 * Run from an operator machine only. The service-role key must never be committed,
 * put in an EXPO_PUBLIC_* var, or pasted into CI logs.
 */
import { createClient } from "@supabase/supabase-js";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const ROLES = ["driver", "admin", "owner", "shipper"];
const LANGUAGES = ["en", "ta", "kn", "hi"];
const LOCAL_HOSTS = ["127.0.0.1", "localhost"];

export function parseFlags(argv) {
  return parseArgs({
    args: argv,
    options: {
      phone: { type: "string" },
      name: { type: "string" },
      role: { type: "string" },
      language: { type: "string" },
      activate: { type: "boolean" },
      deactivate: { type: "boolean" },
    },
  }).values;
}

/** null when OK, else the reason. http is allowed only for the local stack, by host. */
export function validateUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return "SUPABASE_URL is not a valid URL";
  }
  if (parsed.protocol === "https:") return null;
  if (parsed.protocol === "http:" && LOCAL_HOSTS.includes(parsed.hostname)) return null;
  return "SUPABASE_URL must be https (http only for 127.0.0.1 / localhost)";
}

/** The profile columns to write: explicit flags only; defaults only for a new user. */
export function profileUpdate(values, { isNew }) {
  if (values.activate && values.deactivate)
    throw new Error("pass --activate or --deactivate, not both");
  const row = {};
  const role = values.role ?? (isNew ? "driver" : undefined);
  if (role !== undefined) row.role = role;
  if (values.name) row.full_name = values.name;
  const language = values.language ?? (isNew ? "en" : undefined);
  if (language !== undefined) row.preferred_language = language;
  if (values.activate) row.is_active = true;
  else if (values.deactivate) row.is_active = false;
  else if (isNew) row.is_active = true;
  return row;
}

export const normalisePhone = (phone) => (phone ?? "").replace(/\D/g, "");

/** Create-or-update. `client` is a service-role Supabase client (faked in tests). */
export async function provision({ values, client }) {
  const phone = normalisePhone(values.phone);
  if (!/^91\d{10}$/.test(phone))
    throw new Error("--phone must be an Indian mobile number: 91 + 10 digits");
  if (values.role !== undefined && !ROLES.includes(values.role))
    throw new Error(`bad --role (${ROLES.join("|")})`);
  if (values.language !== undefined && !LANGUAGES.includes(values.language))
    throw new Error(`bad --language (${LANGUAGES.join("|")})`);
  if (values.activate && values.deactivate)
    throw new Error("pass --activate or --deactivate, not both");

  // GoTrue stores phones without '+'; handle_new_user copies that into profiles.phone.
  const { data: existing, error: findErr } = await client
    .from("profiles")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();
  if (findErr) throw new Error(`lookup failed: ${findErr.message}`);

  let id = existing?.id;
  if (!id) {
    const { data, error } = await client.auth.admin.createUser({ phone, phone_confirm: true });
    if (error) throw new Error(`createUser failed: ${error.message}`);
    id = data.user.id;
  }

  const row = profileUpdate(values, { isNew: !existing });
  if (Object.keys(row).length > 0) {
    const { error } = await client.from("profiles").update(row).eq("id", id);
    if (error) throw new Error(`profile update failed: ${error.message}`);
  }
  return { id, phone, created: !existing, row };
}

async function main() {
  const fail = (msg) => {
    console.error(`[provision-user] ${msg}`);
    process.exit(1);
  };
  let values;
  try {
    values = parseFlags(process.argv.slice(2));
  } catch (e) {
    fail(e.message);
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail("set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  const urlError = validateUrl(url);
  if (urlError) fail(urlError);

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const { id, phone, created, row } = await provision({ values, client });
    const changed = Object.keys(row).join(", ") || "nothing";
    console.log(
      `[provision-user] ${created ? "created" : "updated"} ${id} (+${phone.slice(0, 4)}xxxx${phone.slice(-4)}); set: ${changed}`,
    );
  } catch (e) {
    fail(e.message);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
