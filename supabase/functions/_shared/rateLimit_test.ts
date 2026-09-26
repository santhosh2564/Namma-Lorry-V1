import { assertEquals } from '@std/assert';

import { createRateLimiter } from './rateLimit.ts';

Deno.test('sliding window frees slots as old hits expire', () => {
  const rl = createRateLimiter(2, 10_000);
  assertEquals(rl.hit('u', 0), 0);
  assertEquals(rl.hit('u', 1_000), 0);
  assertEquals(rl.hit('u', 2_000), 8);
  assertEquals(rl.hit('u', 10_001), 0); // the hit at t=0 expired
  assertEquals(rl.hit('other', 2_000), 0);
});
