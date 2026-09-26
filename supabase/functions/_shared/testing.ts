// Test doubles shared by Edge Function tests.
import type { CallerContext, ContextFactory } from './auth.ts';
import { HttpError } from './http.ts';

/**
 * Fake caller resolution keyed by bearer token:
 * "admin-token" / "admin-2-token" → admins, "driver-token" → non-admin, anything else → 401.
 */
export function fakeContext<Admin>(admin: Admin): ContextFactory<Admin> {
  const users: Record<string, { id: string; admin: boolean }> = {
    'admin-token': { id: 'admin-1', admin: true },
    'admin-2-token': { id: 'admin-2', admin: true },
    'driver-token': { id: 'driver-1', admin: false },
  };
  return (req) => {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const u = users[jwt];
    if (!u) return Promise.reject(new HttpError(401, 'UNAUTHENTICATED'));
    const ctx: CallerContext<Admin> = { userId: u.id, isAdmin: () => Promise.resolve(u.admin), admin };
    return Promise.resolve(ctx);
  };
}

export function post(body: unknown, token?: string, method = 'POST'): Request {
  return new Request('http://localhost/fn', {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
}
