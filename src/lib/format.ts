/** Display formatting shared by screens. All user-facing text goes through i18n. */
import i18n, { localeFor } from '@/i18n';

type Audience = 'driver' | 'console';

const REASONS = [
  'START_OUTSIDE_PICKUP',
  'END_OUTSIDE_DROP',
  'MOCK_LOCATION',
  'TRACKING_GAP',
  'LOW_COVERAGE',
  'MISSING_POINTS',
  'SPEED_IMPLAUSIBLE',
  'GPS_JUMPS',
  'DISTANCE_TOO_SHORT',
  'DISTANCE_TOO_LONG',
] as const;
const STATUSES = [
  'assigned',
  'in_progress',
  'completed',
  'verified',
  'needs_review',
  'rejected',
  'cancelled',
] as const;
const EVENTS = ['started', 'ended', 'verified', 'needs_review', 'approved', 'rejected'] as const;

const includes = <T extends string>(list: readonly T[], value: string): value is T =>
  (list as readonly string[]).includes(value);

/** Plain-language reason (docs/08 §3). Unknown codes never show raw. */
export const reasonText = (code: string) =>
  i18n.t(includes(REASONS, code) ? `reasons.${code}` : 'reasons.unknown');

/** Status label per docs/06 §5 (driver and console wording differ). */
export const statusText = (status: string, audience: Audience) =>
  includes(STATUSES, status) ? i18n.t(`status.${audience}.${status}`) : status;

export const eventText = (type: string) =>
  i18n.t(includes(EVENTS, type) ? `events.${type}` : 'events.unknown');

export const formatKm = (metres: number | null | undefined) =>
  metres == null
    ? i18n.t('common.none')
    : i18n.t('units.km', {
        value: (metres / 1000).toLocaleString(localeFor(i18n.language), {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }),
      });

export const formatDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString(localeFor(i18n.language), {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : i18n.t('common.none');

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(localeFor(i18n.language), {
    hour: '2-digit',
    minute: '2-digit',
  });

export const formatMonth = (iso: string) =>
  new Date(iso).toLocaleDateString(localeFor(i18n.language), { month: 'long', year: 'numeric' });

export function formatAge(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return i18n.t('time.now');
  if (minutes < 60) return i18n.t('time.minutesAgo', { minutes });
  return i18n.t('time.hoursAgo', { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
}

/**
 * "+91 98xxxx4521" — shows enough to recognise your own number, not enough to use it
 * (DESIGN.md sample data; docs/09 data minimisation). Handles GoTrue's "91…" format.
 */
export function maskPhone(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  const national = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  if (national.length !== 10)
    return national ? `${'x'.repeat(Math.max(0, national.length - 4))}${national.slice(-4)}` : '';
  return `+91 ${national.slice(0, 2)}xxxx${national.slice(-4)}`;
}
