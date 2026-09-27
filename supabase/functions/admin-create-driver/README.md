# admin-create-driver

Creates a driver login. Admins are the only way drivers get onto the platform (PRD P0-1, ND-12).

`POST /functions/v1/admin-create-driver` with the caller's JWT:
```json
{ "fullName": "Selvam R", "phone": "98400 12345", "preferredLanguage": "ta" }
```
- `phone`: an Indian mobile number (10 digits, 6–9 first). A `+91`/`91`/`0` prefix and spaces are accepted.
- `preferredLanguage`: `en` (default), `ta`, `kn` or `hi`.

Steps:
1. `@supabase/server` (`createSupabaseContext`, `auth: 'user'`) verifies the JWT against the project JWKS.
   `is_admin()` then runs on the RLS-scoped client (caller's JWT + publishable key).
2. With `ctx.supabaseAdmin` (the **secret key**, injected into Edge Functions by Supabase):
   `auth.admin.createUser({ phone: '91XXXXXXXXXX', phone_confirm: true })`. The `handle_new_user`
   trigger inserts the profile.
3. Update that profile: `full_name`, `preferred_language`, `role = 'driver'`, `is_active = true`.
   If this fails, the auth user is deleted again.

| Status | Body |
|---|---|
| 201 | `{ driver: { id, role, full_name, phone, preferred_language, is_active, created_at } }` |
| 400 | `{ error: 'INVALID_JSON' \| 'INVALID_REQUEST' }` |
| 401 / 403 | `{ error: 'UNAUTHENTICATED' \| 'FORBIDDEN' }` |
| 409 | `{ error: 'PHONE_EXISTS' }` |
| 500 / 502 | `{ error: 'PROFILE_UPDATE_FAILED' \| 'CREATE_USER_FAILED' }` |

No SMS is sent here. The driver signs in with OTP (S2/S3). The "Send invite SMS" toggle is out of scope (ND-19).
Deploy: `npx supabase functions deploy admin-create-driver`.
