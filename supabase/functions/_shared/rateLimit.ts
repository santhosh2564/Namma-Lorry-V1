// Basic per-user sliding-window limiter. State lives in the isolate's memory,
// so it's per instance and resets on cold start: enough to stop a runaway UI loop
// or casual abuse of the paid Mappls quota, not a hard global limit.

export interface RateLimiter {
  /** Returns 0 when allowed, otherwise seconds until the next slot frees up. */
  hit(key: string, now?: number): number;
}

export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    hit(key, now = Date.now()) {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return Math.max(1, Math.ceil((recent[0]! + windowMs - now) / 1000));
      }
      recent.push(now);
      hits.set(key, recent);
      return 0;
    },
  };
}
