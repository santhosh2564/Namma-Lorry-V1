// D6 Trip Summary state and reason texts (docs/12 D6, docs/08 §3). Pure and tested.
import type { TripStateName } from '@/tracking/db';

export type SummaryState =
  | { kind: 'ended-offline'; pending: number }
  | { kind: 'verifying' }
  | { kind: 'verified' }
  | { kind: 'needs-review' }
  | { kind: 'rejected' }
  | { kind: 'cancelled' }
  | { kind: 'in-progress' }
  | { kind: 'unknown' };

export interface SummaryInput {
  /** This phone's state for the trip; null once cleaned up (or ended on another phone). */
  local: { state: TripStateName; pending: number } | null;
  /** Server trips.status; null while loading or unreachable. */
  serverStatus: string | null;
}

export function summaryState(i: SummaryInput): SummaryState {
  // A final server result means the end got through, even if this phone hasn't noticed yet.
  switch (i.serverStatus) {
    case 'verified':
      return { kind: 'verified' };
    case 'needs_review':
      return { kind: 'needs-review' };
    case 'rejected':
      return { kind: 'rejected' };
    case 'cancelled':
      return { kind: 'cancelled' };
  }
  // The phone still holds the end (or points) that the server hasn't got: say so.
  if (i.local && (i.local.state === 'ENDING' || i.local.state === 'ENDED_PENDING_SYNC')) {
    return { kind: 'ended-offline', pending: i.local.pending };
  }
  if (i.local?.state === 'TRACKING') return { kind: 'in-progress' };
  switch (i.serverStatus) {
    case 'completed':
      return { kind: 'verifying' }; // waiting for missing points, or the 6 h sweeper
    case 'in_progress':
      // Only a trip TRACKING on this phone goes back to D5 (handled above). Otherwise the end
      // was sent and the row we hold is older than the sync that just removed the local copy.
      return { kind: 'verifying' };
    case null:
      return i.local ? { kind: 'verifying' } : { kind: 'unknown' };
    default:
      return { kind: 'unknown' };
  }
}

/** Server statuses D6 shows as final: stop listening / polling. (needs_review can still become
 * verified/rejected after an admin review, but that is days later, not worth a live socket.) */
export const FINAL_STATUSES = ['verified', 'needs_review', 'rejected', 'cancelled'] as const;
export const isFinalStatus = (status: string | null | undefined): boolean =>
  (FINAL_STATUSES as readonly string[]).includes(status ?? '');

export type ReasonCode =
  | 'START_OUTSIDE_PICKUP'
  | 'END_OUTSIDE_DROP'
  | 'MOCK_LOCATION'
  | 'TRACKING_GAP'
  | 'LOW_COVERAGE'
  | 'MISSING_POINTS'
  | 'SPEED_IMPLAUSIBLE'
  | 'GPS_JUMPS'
  | 'DISTANCE_TOO_SHORT'
  | 'DISTANCE_TOO_LONG';

export const REASON_CODES: ReasonCode[] = [
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
];

/** verify_trip's verification_metrics (0001). Every field may be missing or null. */
export interface VerificationMetrics {
  points?: number | null;
  mocked?: number | null;
  jumps?: number | null;
  max_gap_s?: number | null;
  avg_kmh?: number | null;
  planned_ratio?: number | null;
  start_distance_m?: number | null;
  end_distance_m?: number | null;
}

export interface ReasonView {
  code: string;
  /** i18n key: t.reasons[code] (unknown codes fall back to t.reasons.OTHER). */
  key: ReasonCode | 'OTHER';
  /** Number for the detail text (metres, minutes, km/h, percent), when the metrics have it. */
  value: number | null;
}

function metricFor(code: ReasonCode, m: VerificationMetrics): number | null {
  const n = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  switch (code) {
    case 'START_OUTSIDE_PICKUP':
      return n(m.start_distance_m);
    case 'END_OUTSIDE_DROP':
      return n(m.end_distance_m);
    case 'TRACKING_GAP': {
      const s = n(m.max_gap_s);
      return s === null ? null : Math.round(s / 60);
    }
    case 'SPEED_IMPLAUSIBLE':
      return n(m.avg_kmh);
    case 'GPS_JUMPS':
      return n(m.jumps);
    case 'DISTANCE_TOO_SHORT':
    case 'DISTANCE_TOO_LONG': {
      const r = n(m.planned_ratio);
      return r === null ? null : Math.round(r * 100);
    }
    default:
      return null;
  }
}

export function reasonViews(codes: string[] | null | undefined, metrics: unknown): ReasonView[] {
  const m = (metrics && typeof metrics === 'object' ? metrics : {}) as VerificationMetrics;
  return (codes ?? []).map((code) => {
    const known = (REASON_CODES as string[]).includes(code) ? (code as ReasonCode) : null;
    return { code, key: known ?? 'OTHER', value: known ? metricFor(known, m) : null };
  });
}
