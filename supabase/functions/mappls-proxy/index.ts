import { supabaseUserClient } from '../_shared/auth.ts';
import { createRateLimiter } from '../_shared/rateLimit.ts';
import { createHandler } from './handler.ts';

// 60 Mappls calls per admin per minute (autosuggest is debounced in the console).
Deno.serve(
  createHandler({
    makeUserClient: supabaseUserClient,
    rateLimiter: createRateLimiter(60, 60_000),
    fetch,
    getEnv: (name) => Deno.env.get(name),
  }),
);
