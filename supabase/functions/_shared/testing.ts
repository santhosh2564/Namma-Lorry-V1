// Test doubles shared by Edge Function tests.
import type { UserClientFactory } from './auth.ts';

/** Tokens: "admin-token" → admin, "driver-token" → non-admin, anything else → invalid. */
export const fakeUserClients: UserClientFactory = (header) => {
  const jwt = header.replace(/^Bearer\s+/i, '');
  const users: Record<string, { id: string; admin: boolean }> = {
    'admin-token': { id: 'admin-1', admin: true },
    'admin-2-token': { id: 'admin-2', admin: true },
    'driver-token': { id: 'driver-1', admin: false },
  };
  const u = users[jwt];
  return {
    auth: {
      getUser: () =>
        Promise.resolve(
          u
            ? { data: { user: { id: u.id } }, error: null }
            : { data: { user: null }, error: new Error('bad jwt') },
        ),
    },
    rpc: () => Promise.resolve({ data: u?.admin ?? false, error: null }),
  };
};

export function post(body: unknown, token?: string, method = 'POST'): Request {
  return new Request('http://localhost/fn', {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
}
