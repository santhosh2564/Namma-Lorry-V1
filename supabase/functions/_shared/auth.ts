// Caller verification shared by admin-only functions.
// The JWT is verified by GoTrue (`auth.getUser`), then `is_admin()` runs as that
// user under RLS, so a forged or non-admin token never reaches Mappls or the
// service-role client.
import { createClient } from '@supabase/supabase-js';

import { HttpError } from './http.ts';

export interface Caller {
  userId: string;
}

/** Minimal surface used from the per-request user client (mockable in tests). */
export interface UserClient {
  auth: { getUser(jwt: string): Promise<{ data: { user: { id: string } | null }; error: unknown }> };
  rpc(fn: 'is_admin'): PromiseLike<{ data: unknown; error: unknown }>;
}

export type UserClientFactory = (authHeader: string) => UserClient;

export function bearer(req: Request): { header: string; jwt: string } {
  const header = req.headers.get('Authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) throw new HttpError(401, 'UNAUTHENTICATED');
  return { header, jwt: m[1]! };
}

export async function requireAdmin(req: Request, makeClient: UserClientFactory): Promise<Caller> {
  const { header, jwt } = bearer(req);
  const client = makeClient(header);
  const { data, error } = await client.auth.getUser(jwt);
  if (error || !data.user) throw new HttpError(401, 'UNAUTHENTICATED');
  const admin = await client.rpc('is_admin');
  if (admin.error) throw new HttpError(500, 'AUTH_CHECK_FAILED');
  if (admin.data !== true) throw new HttpError(403, 'FORBIDDEN');
  return { userId: data.user.id };
}

export function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new HttpError(500, 'CONFIG_MISSING', `${name} is not set`);
  return v;
}

/** Real factory: anon key + the caller's Authorization header, so RLS applies. */
export const supabaseUserClient: UserClientFactory = (authHeader) =>
  createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as UserClient;
