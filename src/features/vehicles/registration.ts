// Indian vehicle registration numbers (Motor Vehicles Act format + Bharat series).
//   Standard: SS NN [XXX] NNNN, e.g. "TN 23 BK 4521", "TN 70 C 3310", "DL 1C AA 1234"
//   BH series: YY BH NNNN XX, e.g. "22 BH 1234 AA"
// Input is case-insensitive; spaces, hyphens and dots are ignored.

/** State / UT codes in use (incl. legacy OR, UA, CT, DD/DN and new TG). */
// prettier-ignore
export const STATE_CODES = new Set([
  'AN', 'AP', 'AR', 'AS', 'BR', 'CG', 'CH', 'CT', 'DD', 'DL', 'DN', 'GA', 'GJ', 'HP', 'HR', 'JH', 'JK', 'KA',
  'KL', 'LA', 'LD', 'MH', 'ML', 'MN', 'MP', 'MZ', 'NL', 'OD', 'OR', 'PB', 'PY', 'RJ', 'SK', 'TG', 'TN', 'TR',
  'TS', 'UA', 'UK', 'UP', 'WB',
]);

// State, RTO (1–2 digits, Delhi also uses a letter suffix like "1C"), optional series (1–3 letters), number (1–4 digits).
const STANDARD = /^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{1,4})$/;
const BHARAT = /^(\d{2})BH(\d{4})([A-Z]{1,2})$/;

export type RegistrationResult = { ok: true; formatted: string } | { ok: false };

export function parseRegistration(input: string): RegistrationResult {
  const s = input.toUpperCase().replace(/[\s.\-]/g, '');
  const bh = BHARAT.exec(s);
  if (bh) {
    const [, yy, num, series] = bh;
    // Letters I and O are never issued (confusable with 1 and 0).
    if (/[IO]/.test(series!)) return { ok: false };
    return { ok: true, formatted: `${yy} BH ${num} ${series}` };
  }
  const m = STANDARD.exec(s);
  if (!m) return { ok: false };
  const [, state, rto, series, num] = m;
  if (!STATE_CODES.has(state!)) return { ok: false };
  if (Number(rto) === 0 || Number(num) === 0) return { ok: false };
  // Without a series letter the number must be the full 4 digits, otherwise "TN23" would parse as TN 2 3.
  if (!series && num!.length !== 4) return { ok: false };
  // Delhi adds a vehicle-category letter to the RTO: "DL 1C AA 1234".
  if (state === 'DL' && series!.length === 3) {
    return { ok: true, formatted: `DL ${rto}${series![0]} ${series!.slice(1)} ${num}` };
  }
  return { ok: true, formatted: [state, rto, series, num].filter(Boolean).join(' ') };
}
