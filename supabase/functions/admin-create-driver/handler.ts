// admin-create-driver: the only way drivers are created (PRD P0-1, ND-12).
// The caller must be an admin; the auth user is then created with the admin
// client (secret key), which never leaves this function.
import { z } from 'zod';

import { type ContextFactory, requireAdmin } from '../_shared/auth.ts';
import { handle, HttpError, json, readJson } from '../_shared/http.ts';

export const requestSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  /** 10-digit Indian mobile; "+91"/"91"/"0" prefixes and spaces are accepted. */
  phone: z
    .string()
    .transform((raw) => {
      let d = raw.replace(/\D/g, '');
      if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
      else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
      return d;
    })
    .pipe(z.string().regex(/^[6-9]\d{9}$/, 'invalid phone')),
  preferredLanguage: z.enum(['en', 'ta', 'kn', 'hi']).default('en'),
});

export interface DriverProfile {
  id: string;
  role: string;
  full_name: string;
  phone: string | null;
  preferred_language: string | null;
  is_active: boolean;
  created_at: string;
}

/** The privileged operations this function needs (mockable in tests). */
export interface AdminApi {
  createUser(phone: string): Promise<{ id: string } | { errorCode: string; message: string }>;
  deleteUser(id: string): Promise<void>;
  setDriverProfile(
    id: string,
    fields: { full_name: string; preferred_language: string },
  ): Promise<DriverProfile | { errorCode: string; message: string }>;
}

export interface CreateDriverDeps {
  makeContext: ContextFactory<AdminApi>;
}

export function createHandler(deps: CreateDriverDeps) {
  return (req: Request) =>
    handle(req, async () => {
      const { admin } = await requireAdmin(req, deps.makeContext);

      const parsed = requestSchema.safeParse(await readJson(req));
      if (!parsed.success) {
        throw new HttpError(
          400,
          'INVALID_REQUEST',
          parsed.error.issues.map((i) => i.path.join('.')).join(', '),
        );
      }
      const { fullName, phone, preferredLanguage } = parsed.data;

      // GoTrue stores phones without "+"; handle_new_user copies it into profiles.phone.
      const created = await admin.createUser(`91${phone}`);
      if ('errorCode' in created) {
        if (
          created.errorCode === 'phone_exists' || /already (been )?registered|exists/i.test(created.message)
        ) {
          throw new HttpError(409, 'PHONE_EXISTS');
        }
        throw new HttpError(502, 'CREATE_USER_FAILED', created.message);
      }

      const profile = await admin.setDriverProfile(created.id, {
        full_name: fullName,
        preferred_language: preferredLanguage,
      });
      if ('errorCode' in profile) {
        // Don't leave a half-created login behind.
        await admin.deleteUser(created.id);
        throw new HttpError(500, 'PROFILE_UPDATE_FAILED', profile.message);
      }
      return json({ driver: profile }, 201);
    });
}
