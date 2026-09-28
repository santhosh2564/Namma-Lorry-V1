/**
 * D8 profile display rules (M11, docs/12 D8).
 *
 * The header card shows an initials avatar, a name, a **masked** phone and
 * "Driver since Oct 2026 on Namma Lorry". Three of those are formatting
 * decisions with a privacy consequence, so they live here rather than in JSX:
 *
 * - The phone is masked in the app. A driver's full number is on the dispatch
 *   screen where the people who need it can see it; on their own locked phone
 *   it is not, and D1 already explains what the app stores.
 * - "Driver since" is the month the account was created, from the profile row
 *   — the only honest source for it. Nothing in the database records a joining
 *   date separately.
 */
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Pure: "Murugan S" → "MS". Falls back to "?" for a nameless profile. */
export function initialsOf(name: string | null | undefined): string {
  if (name === null || name === undefined) {
    return "?";
  }
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => part !== "");
  if (parts.length === 0) {
    return "?";
  }
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

/**
 * Pure: `+919876543210` → `+91 98xxx x3210`.
 *
 * Enough digits to recognise the number you gave, not enough to read it aloud.
 * A short or already-masked value is passed through rather than mangled.
 */
export function maskPhone(phone: string | null | undefined): string {
  if (phone === null || phone === undefined) {
    return "—";
  }
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) {
    return phone;
  }
  const national = digits.length > 10 ? digits.slice(-10) : digits;
  return `+91 ${national.slice(0, 2)}xxx x${national.slice(-4)}`;
}

/** Pure: `"Oct 2026"`, or null. Hand-rolled like D6's date formatting. */
export function monthYearLabel(iso: string | null | undefined): string | null {
  if (iso === null || iso === undefined) {
    return null;
  }
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) {
    return null;
  }
  const date = new Date(at);
  return `${MONTHS[date.getMonth()] ?? MONTHS[0]} ${date.getFullYear()}`;
}
