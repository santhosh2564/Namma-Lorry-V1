import { supabaseContext } from '../_shared/auth.ts';
import { createRateLimiter } from '../_shared/rateLimit.ts';
import { createHandler } from './handler.ts';

// 60 Mappls calls per admin per minute (autosuggest is debounced in the console).
export default {
  fetch: createHandler({
    makeContext: supabaseContext(() => null), // no privileged DB access needed
    rateLimiter: createRateLimiter(60, 60_000),
    fetch,
    getEnv: (name) => Deno.env.get(name),
  }),
};
