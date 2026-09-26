// mappls-proxy (docs/06 §4): admin-only proxy to Mappls REST with server-held credentials.
import { z } from 'zod';

import { requireAdmin, type UserClientFactory } from '../_shared/auth.ts';
import { handle, HttpError, json, readJson } from '../_shared/http.ts';
import type { RateLimiter } from '../_shared/rateLimit.ts';
import * as mappls from './mappls.ts';

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);
const point = z.object({ lat, lng });

export const requestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('autosuggest'),
    // Mappls rejects queries longer than 45 characters.
    query: z.string().trim().min(2).max(45),
    lat: lat.optional(),
    lng: lng.optional(),
  }),
  z.object({ action: z.literal('geocode'), address: z.string().trim().min(3).max(300) }),
  z.object({ action: z.literal('reverse'), lat, lng }),
  z.object({ action: z.literal('distance'), from: point, to: point }),
]);

export interface ProxyDeps {
  makeUserClient: UserClientFactory;
  rateLimiter: RateLimiter;
  fetch: typeof fetch;
  getEnv: (name: string) => string | undefined;
}

export function createHandler(deps: ProxyDeps) {
  return (req: Request) =>
    handle(req, async () => {
      const caller = await requireAdmin(req, deps.makeUserClient);

      const retryAfter = deps.rateLimiter.hit(caller.userId);
      if (retryAfter > 0) {
        return json({ error: 'RATE_LIMITED' }, 429, { 'Retry-After': String(retryAfter) });
      }

      const parsed = requestSchema.safeParse(await readJson(req));
      if (!parsed.success) {
        throw new HttpError(
          400,
          'INVALID_REQUEST',
          parsed.error.issues.map((i) => i.path.join('.') || i.message).join(', '),
        );
      }

      const key = deps.getEnv('MAPPLS_REST_KEY');
      if (!key) throw new HttpError(500, 'CONFIG_MISSING', 'MAPPLS_REST_KEY is not set');
      const m: mappls.MapplsDeps = {
        fetch: deps.fetch,
        key,
        profile: deps.getEnv('MAPPLS_ROUTE_PROFILE') === 'driving' ? 'driving' : 'trucking',
      };

      const body = parsed.data;
      switch (body.action) {
        case 'autosuggest': {
          const near = body.lat !== undefined && body.lng !== undefined
            ? { lat: body.lat, lng: body.lng }
            : undefined;
          return json(await mappls.autosuggest(m, body.query, near));
        }
        case 'geocode': {
          const r = await mappls.geocode(m, body.address);
          if (!r) throw new HttpError(404, 'NOT_FOUND');
          return json(r);
        }
        case 'reverse': {
          const r = await mappls.reverse(m, body);
          if (!r) throw new HttpError(404, 'NOT_FOUND');
          return json(r);
        }
        case 'distance': {
          const r = await mappls.distance(m, body.from, body.to);
          if (!r) throw new HttpError(404, 'NO_ROUTE');
          return json(r);
        }
      }
    });
}
