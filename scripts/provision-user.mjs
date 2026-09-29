#!/usr/bin/env node
/**
 * Operator tool (M12c): create or update a phone-login user on a HOSTED Supabase project.
 * Hosted auth runs with phone sign-ups disabled (docs/release/SUPABASE_HOSTED.md §4, ND-12),
 * so the admin, pilot drivers and the App Review demo account are provisioned here.
 *
 *   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<secret key> \
 *     node scripts/provision-user.mjs --phone 919876543210 --name "Murugan S" --role driver
 *
 * Run from an operator machine only. The service-role key must never be committed,
 * put in an EXPO_PUBLIC_* var, or pasted into CI logs.
 */
import { createClient } from '@supabase/supabase-js';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    phone: { type: 'string' },
    name: { type: 'string', default: '' },
    role: { type: 'string', default: 'driver' },
    language: { type: 'string', default: 'en' },
    deactivate: { type: 'boolean', default: false },
  },
});

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const phone = (values.phone ?? '').replace(/\D/g, '');

function fail(msg) {
  console.error(`[provision-user] ${msg}`);
  process.exit(1);
}
if (!url || !key) fail('set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
if (!/^https:\/\//.test(url) && !/127\.0\.0\.1|localhost/.test(url))
  fail('SUPABASE_URL must be https');
if (!/^91\d{10}$/.test(phone)) fail('--phone must be an Indian mobile number: 91 + 10 digits');
if (!['driver', 'admin', 'owner', 'shipper'].includes(values.role)) fail('bad --role');
if (!['en', 'ta', 'kn', 'hi'].includes(values.language)) fail('bad --language');

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// GoTrue stores phones without '+'; handle_new_user copies that into profiles.phone.
const { data: existing, error: findErr } = await admin
  .from('profiles')
  .select('id')
  .eq('phone', phone)
  .maybeSingle();
if (findErr) fail(`lookup failed: ${findErr.message}`);

let id = existing?.id;
if (!id) {
  const { data, error } = await admin.auth.admin.createUser({ phone, phone_confirm: true });
  if (error) fail(`createUser failed: ${error.message}`);
  id = data.user.id;
}

const { error: updErr } = await admin
  .from('profiles')
  .update({
    role: values.role,
    ...(values.name ? { full_name: values.name } : {}),
    preferred_language: values.language,
    is_active: !values.deactivate,
  })
  .eq('id', id);
if (updErr) fail(`profile update failed: ${updErr.message}`);

console.log(
  `[provision-user] ${existing ? 'updated' : 'created'} ${values.role} ${id} (+${phone.slice(0, 4)}xxxx${phone.slice(-4)})`,
);
