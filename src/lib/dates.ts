import { t } from '@/i18n';

const IST_OFFSET_MS = 5.5 * 3_600_000;

/** "26 Sep 2026" in IST. Built by hand: Intl month names differ between ICU builds ("Sep"/"Sept"). */
export function formatDateIST(iso: string): string {
  const d = new Date(Date.parse(iso) + IST_OFFSET_MS);
  return `${d.getUTCDate()} ${t.common.months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
