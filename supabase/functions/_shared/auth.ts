// Caller verification shared by admin-only functions, built on @supabase/server.
//
// createSupabaseContext verifies the user's JWT against the project JWKS and
// returns two clients: `supabase` (the caller's JWT + publishable key, so RLS
// applies) and `supabaseAdmin` (secret key, bypasses RLS). is_admin() runs on
// the RLS-scoped client, so a deactivated or non-admin caller never reaches
// Mappls or the admin client.
import { createSupabaseContext, type SupabaseEnv } from '@supabase/server';
import type { SupabaseClient, SupabaseClientOptions } from '@supabase/supabase-js';

import { HttpError } from './http.ts';

export interface CallerContext<Admin> {
  userId: string;
  /** `is_admin()` evaluated as the caller (active admin profile). */
  isAdmin(): Promise<boolean>;
  /** Privileged operations; only touched after `requireAdmin` passes. */
  admin: Admin;
}

/** Resolves the caller or throws HttpError 401 / 500. Swapped for a fake in tests. */
export type ContextFactory<Admin> = (req: Request) => Promise<CallerContext<Admin>>;

export async function requireAdmin<Admin>(
  req: Request,
  makeContext: ContextFactory<Admin>,
): Promise<CallerContext<Admin>> {
  const ctx = await makeContext(req);
  if (!(await ctx.isAdmin())) throw new HttpError(403, 'FORBIDDEN');
  return ctx;
}

export interface ContextOptions {
  /** Overrides for tests; on Supabase every value is injected automatically. */
  env?: Partial<SupabaseEnv>;
  supabaseOptions?: SupabaseClientOptions<string>;
}

/** Real factory: `auth: 'user'` via @supabase/server. */
export function supabaseContext<Admin>(
  toAdmin: (supabaseAdmin: SupabaseClient) => Admin,
  options: ContextOptions = {},
): ContextFactory<Admin> {
  return async (req) => {
    const { data: ctx, error } = await createSupabaseContext(req, {
      auth: 'user',
      env: options.env,
      supabaseOptions: options.supabaseOptions,
    });
    if (error) {
      // 401: missing / invalid / expired JWT. 500: misconfiguration (no JWKS, missing keys).
      if (error.status === 401) throw new HttpError(401, 'UNAUTHENTICATED');
      console.error(error.code, error.message);
      throw new HttpError(500, 'AUTH_CONFIG');
    }
    const userId = ctx.userClaims?.id;
    if (!userId) throw new HttpError(401, 'UNAUTHENTICATED');
    return {
      userId,
      isAdmin: async () => {
        const { data, error: rpcError } = await ctx.supabase.rpc('is_admin');
        if (rpcError) throw new HttpError(500, 'AUTH_CHECK_FAILED');
        return data === true;
      },
      admin: toAdmin(ctx.supabaseAdmin as SupabaseClient),
    };
  };
}
