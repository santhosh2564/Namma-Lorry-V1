// PII scrubbing for error reports (docs/09, M12a): phone numbers and coordinates never leave
// the device inside a Sentry event or breadcrumb. Pure and unit-tested (scrub.test.ts).

export const REDACTED = '[redacted]';

/** Keys whose values are always dropped, whatever they contain. */
const SENSITIVE_KEY =
  /^(phone|phone_number|mobile|msisdn|lat|lng|lon|long|latitude|longitude|coords?|coordinates|position|location|start_lat|start_lng|end_lat|end_lng|pickup_lat|pickup_lng|drop_lat|drop_lng|p_lat|p_lng|path|points|email|ip_address|token|access_token|refresh_token|authorization|apikey|password|otp)$/i;

// Indian mobile numbers with or without +91 / 91 / 0, with spaces or dashes: +91 98402 34521,
// 919840234521, 98402-34521. Also any other +<country><8–14 digits> number.
const PHONE = /(?<![\w.])(?:\+?91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?!\d)|\+\d[\d\s-]{8,16}\d/g;
// "12.95630, 79.94220" or "lat=12.9563&lng=79.9422"-style pairs and lone high-precision decimals
// (≥ 4 decimal places ≈ 11 m) that look like WGS84 values.
const COORD_PAIR = /-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/g;
const PRECISE_DECIMAL = /(?<![\w.:])-?\d{1,3}\.\d{4,}(?!\d)/g; // not a time's fractional seconds
const COORD_PARAM = /\b(lat|lng|lon|latitude|longitude|phone)=([^&\s#]*)/gi;

export function scrubString(s: string): string {
  return s
    .replace(COORD_PARAM, (_m, k: string) => `${k}=${REDACTED}`)
    .replace(COORD_PAIR, REDACTED)
    .replace(PHONE, REDACTED)
    .replace(PRECISE_DECIMAL, REDACTED);
}

/** A number that could be a latitude/longitude: within ±180 with ≥ 4 decimal places. */
const looksLikeCoordinate = (n: number) => Math.abs(n) <= 180 && /\.\d{4,}/.test(String(n));

/** Deep copy with sensitive keys removed and strings scrubbed. Other numbers (counts, ids) stay. */
export function scrubValue<T>(value: T, depth = 0): T {
  if (depth > 12) return REDACTED as T;
  if (typeof value === 'string') return scrubString(value) as T;
  if (typeof value === 'number' && looksLikeCoordinate(value)) return REDACTED as T;
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? REDACTED : scrubValue(v, depth + 1);
    }
    return out as T;
  }
  return value;
}

/**
 * Sentry `beforeSend`: keeps only the user id (a UUID, needed to group a driver's crashes),
 * drops request bodies/cookies, then scrubs every string in the event.
 */
export function scrubEvent<E extends object>(event: E): E {
  const e = { ...event } as { user?: { id?: unknown } | null; request?: { url?: string; method?: string } };
  if (e.user) e.user = typeof e.user.id === 'string' ? { id: e.user.id } : undefined;
  if (e.request) e.request = { url: e.request.url, method: e.request.method };
  return scrubValue(e as E);
}

/** Sentry `beforeBreadcrumb`: console/fetch breadcrumbs keep their shape, lose PII. */
export function scrubBreadcrumb<B extends object>(crumb: B): B {
  return scrubValue(crumb);
}
