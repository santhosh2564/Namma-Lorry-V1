/**
 * PII scrubbing for crash reports (validation report B4, docs/09 §1 data
 * minimisation).
 *
 * Removes phone numbers and GPS coordinates from any JSON-like value:
 * - values under phone / coordinate-looking keys become "[Filtered]";
 * - phone numbers and high-precision decimals inside strings are masked.
 *
 * Pure and dependency-free, so it is unit-tested without Sentry.
 */
export const FILTERED = "[Filtered]";

const SENSITIVE_KEY =
  /^(p_)?(phone|phone_number|mobile|lat|lng|lon|latitude|longitude|coords?|position|location|(start|end|pickup|drop)_(lat|lng)|altitude_m|geog|pickup_geog|drop_geog)$/i;

// +91 98765 43210, +919876543210, 919876543210, 98765-43210, 9876543210
const PHONE = /(?<![\d.])(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?![\d.])/g;
// 12.9563, 79.94221: lat/lng precision (≥ 4 decimals) is what makes a location identifying.
const COORDINATE = /-?\b\d{1,3}\.\d{4,}\b/g;

export function scrubString(value: string): string {
  return value.replace(PHONE, "[phone]").replace(COORDINATE, "[coord]");
}

export function scrubValue<T>(value: T, depth = 0, seen = new WeakSet<object>()): T {
  if (typeof value === "string") {
    return scrubString(value) as T;
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (depth > 12 || seen.has(value)) {
    return FILTERED as T;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, depth + 1, seen)) as T;
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? FILTERED : scrubValue(item, depth + 1, seen);
  }
  return out as T;
}

/** Scrubs a whole Sentry event; the user is reduced to their opaque id. */
export function scrubEvent<T extends { user?: { id?: string | number } }>(event: T): T {
  const scrubbed = scrubValue(event);
  if (event.user) {
    scrubbed.user = event.user.id === undefined ? {} : { id: event.user.id };
  }
  return scrubbed;
}
