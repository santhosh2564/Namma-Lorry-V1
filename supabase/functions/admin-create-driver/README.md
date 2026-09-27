# `admin-create-driver` — the only way a driver gets an account

Phase 1 has **no self-signup**. The M5 sign-in screen calls
`signInWithOtp({ shouldCreateUser: false })`, so a number that has no
`auth.users` row is refused with "Contact Namma Lorry to register" (PRD P0-1,
ND-12). This function is the other half of that rule: an admin registers a
driver, and from then on the driver signs in with an OTP like anyone else.

```
POST /functions/v1/admin-create-driver     Authorization: Bearer <admin jwt>
{ "fullName": "Murugan S", "phone": "9000000011" }
```

`201` on success:

```json
{ "id": "<auth user id>", "fullName": "Murugan S", "phone": "+91900000011" }
```

Errors are `{ "error": { "code", "message" } }`:

| code | status | meaning |
|---|---|---|
| `UNAUTHENTICATED` | 401 | missing or invalid JWT |
| `FORBIDDEN` | 403 | caller is not an active admin |
| `BAD_REQUEST` | 400 | bad name or phone number |
| `PHONE_EXISTS` | 409 | the number already has an account |
| `CREATE_FAILED` | 500 | Supabase auth refused, message not forwarded |
| `PROFILE_FAILED` | 500 | the user exists but the profile did not save |

## Why the service-role key

Creating a row in `auth.users` is not something RLS can allow a client to do, so
this function uses the service role. That is exactly why the key is read here
and **nowhere else** — the app bundle holds only the anon key, and RLS is what
makes the driver's own rows readable and nothing else (CLAUDE.md rule 6,
docs/09 §2, docs/07 §4).

The role check is deliberately *not* done with the service role: `is_admin()`
runs as the caller, so Postgres — not this function — decides who is an admin.
A deactivated admin fails that check and is refused.

## What it writes

1. `auth.users` — the auth user, with `phone_confirm: false`. The number is
   confirmed by the OTP the driver enters on their first sign-in.
2. `profiles` — the `handle_new_user` trigger already inserts a row with the
   default role, so this only fills in `full_name` and normalises `phone` to
   E.164. The role is always written as `driver`; the request body cannot
   influence it.

`driver_stats` is **not** created here: `apply_verified_stats()` upserts it when
a trip is verified, and the console treats a missing row as zero trips and zero
km.

## Excluded on purpose (ND-19)

- No "send invite SMS" toggle — the OTP is the driver's own first sign-in.
- No permission-health dot — permissions are only requested in M9's onboarding.

## Tests

```bash
deno test supabase/functions/
```

`driver_test.ts` fakes the service role, so the suite runs with no Supabase
project. What it pins down is the part that matters: that a non-admin cannot
create anything, that invalid input never reaches the service role, that the
phone is normalised (including the `91…` form used in `docs/DEV_SETUP.md`), that
a duplicate number is a `409` rather than a second account, and that internal
Supabase wording never reaches the console.

## Deploy

```bash
supabase functions deploy admin-create-driver
```
