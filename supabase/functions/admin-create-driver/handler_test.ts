import { assertEquals } from '@std/assert';

import { fakeUserClients, post } from '../_shared/testing.ts';
import { type AdminApi, createHandler, type DriverProfile } from './handler.ts';

function fakeAdmin(opts: { existing?: string[]; failProfile?: boolean } = {}) {
  const users = new Set(opts.existing ?? []);
  const log: string[] = [];
  const api: AdminApi = {
    createUser(phone) {
      log.push(`create ${phone}`);
      if (users.has(phone)) {
        return Promise.resolve({
          errorCode: 'phone_exists',
          message: 'Phone number already registered by another user',
        });
      }
      users.add(phone);
      return Promise.resolve({ id: `user-${phone}` });
    },
    deleteUser(id) {
      log.push(`delete ${id}`);
      return Promise.resolve();
    },
    setDriverProfile(id, fields) {
      log.push(`profile ${id} ${fields.full_name} ${fields.preferred_language}`);
      if (opts.failProfile) return Promise.resolve({ errorCode: '42501', message: 'denied' });
      const p: DriverProfile = {
        id,
        role: 'driver',
        full_name: fields.full_name,
        phone: id.replace('user-', ''),
        preferred_language: fields.preferred_language,
        is_active: true,
        created_at: '2026-09-26T00:00:00Z',
      };
      return Promise.resolve(p);
    },
  };
  return { api, log };
}

const body = { fullName: 'Selvam R', phone: '+91 98400 12345', preferredLanguage: 'ta' };

Deno.test('non-admin (403) and anonymous (401) callers never reach the service role', async () => {
  const { api, log } = fakeAdmin();
  const handler = createHandler({ makeUserClient: fakeUserClients, admin: () => api });
  assertEquals((await handler(post(body))).status, 401);
  assertEquals((await handler(post(body, 'forged'))).status, 401);
  const res = await handler(post(body, 'driver-token'));
  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, 'FORBIDDEN');
  assertEquals(log, []);
});

Deno.test('admin creates a driver: phone normalised to 91XXXXXXXXXX, profile named', async () => {
  const { api, log } = fakeAdmin();
  const handler = createHandler({ makeUserClient: fakeUserClients, admin: () => api });
  const res = await handler(post(body, 'admin-token'));
  assertEquals(res.status, 201);
  const { driver } = await res.json();
  assertEquals(driver.full_name, 'Selvam R');
  assertEquals(driver.role, 'driver');
  assertEquals(driver.preferred_language, 'ta');
  assertEquals(log, ['create 919840012345', 'profile user-919840012345 Selvam R ta']);
});

Deno.test('language defaults to en', async () => {
  const { api, log } = fakeAdmin();
  const handler = createHandler({ makeUserClient: fakeUserClients, admin: () => api });
  await handler(post({ fullName: 'Arun', phone: '9840012346' }, 'admin-token'));
  assertEquals(log[1], 'profile user-919840012346 Arun en');
});

Deno.test('duplicate phone → 409 PHONE_EXISTS', async () => {
  const { api } = fakeAdmin({ existing: ['919840012345'] });
  const handler = createHandler({ makeUserClient: fakeUserClients, admin: () => api });
  const res = await handler(post(body, 'admin-token'));
  assertEquals(res.status, 409);
  assertEquals((await res.json()).error, 'PHONE_EXISTS');
});

Deno.test('invalid input → 400 and nothing is created', async () => {
  const { api, log } = fakeAdmin();
  const handler = createHandler({ makeUserClient: fakeUserClients, admin: () => api });
  for (
    const b of [
      { ...body, phone: '12345' },
      { ...body, phone: '5840012345' },
      { ...body, fullName: ' ' },
      { ...body, preferredLanguage: 'fr' },
      {},
    ]
  ) {
    const res = await handler(post(b, 'admin-token'));
    assertEquals(res.status, 400, JSON.stringify(b));
  }
  assertEquals(log, []);
});

Deno.test('profile update failure rolls back the auth user', async () => {
  const { api, log } = fakeAdmin({ failProfile: true });
  const handler = createHandler({ makeUserClient: fakeUserClients, admin: () => api });
  const res = await handler(post(body, 'admin-token'));
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, 'PROFILE_UPDATE_FAILED');
  assertEquals(log.at(-1), 'delete user-919840012345');
});
