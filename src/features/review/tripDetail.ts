// C6 Trip Detail & Review helpers (docs/12 C6), pure and unit-tested.
import type { RoutePoint } from './api';
import { pick, t } from '@/i18n';

// ---------- Replay ----------

/** A full replay takes about this many ticks, whatever the trip length. */
export const REPLAY_TICKS = 300;
export const REPLAY_TICK_MS = 100;

export const replayStep = (n: number): number => Math.max(1, Math.ceil(n / REPLAY_TICKS));

/** Next replay index; stops at the last point. */
export function nextReplayIndex(i: number, n: number): number {
  if (n <= 0) return 0;
  return Math.min(n - 1, i + replayStep(n));
}

/**
 * Live append: realtime `trip_live` carries the newest point. Adds it if it is newer than the
 * last loaded one (seq is unknown on trip_live, so it gets a provisional seq after the last).
 */
export function appendLivePoint(
  points: RoutePoint[],
  live: { lat: number; lng: number; heading?: number | null; recorded_at: string },
): RoutePoint[] {
  const last = points.at(-1);
  if (last && Date.parse(live.recorded_at) <= Date.parse(last.recorded_at)) return points;
  return [
    ...points,
    {
      seq: (last?.seq ?? 0) + 1,
      lat: live.lat,
      lng: live.lng,
      recorded_at: live.recorded_at,
      heading: live.heading ?? null,
      speed_mps: null,
      accuracy_m: null,
      is_mocked: false,
    },
  ];
}

// ---------- Metrics ----------

export interface MetricItem {
  key: string;
  label: string;
  value: string;
}

/** 84 → "84 m", 1830 → "1.8 km", 396574 → "397 km". */
function metres(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  const tenths = Math.round(m / 100) / 10;
  return `${tenths >= 10 ? Math.round(m / 1000) : tenths.toFixed(1)} km`;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function metricItems(
  metrics: unknown,
  trackedDistanceM: number | null,
  expectedPoints: number | null,
): MetricItem[] {
  const m = (metrics && typeof metrics === 'object' ? metrics : {}) as Record<string, unknown>;
  const m_ = t.console.metrics;
  const points = num(m.points);
  const gap = num(m.max_gap_s);
  const items: [string, string, string | null][] = [
    [
      'tracked',
      m_.tracked,
      trackedDistanceM === null ? null : `${Math.round(trackedDistanceM / 100) / 10} km`,
    ],
    [
      'points',
      m_.points,
      points === null
        ? null
        : expectedPoints !== null
          ? `${points.toLocaleString('en-IN')} / ${expectedPoints.toLocaleString('en-IN')}`
          : points.toLocaleString('en-IN'),
    ],
    [
      'max_gap',
      m_.max_gap,
      gap === null ? null : gap < 120 ? `${Math.round(gap)} s` : `${Math.round(gap / 60)} min`,
    ],
    ['avg_kmh', m_.avg_kmh, num(m.avg_kmh) === null ? null : `${num(m.avg_kmh)} km/h`],
    ['planned_ratio', m_.planned_ratio, num(m.planned_ratio) === null ? null : String(num(m.planned_ratio))],
    ['jumps', m_.jumps, num(m.jumps) === null ? null : String(num(m.jumps))],
    ['mocked', m_.mocked, num(m.mocked) === null ? null : String(num(m.mocked))],
    ['start_d', m_.start_d, num(m.start_distance_m) === null ? null : metres(num(m.start_distance_m)!)],
    ['end_d', m_.end_d, num(m.end_distance_m) === null ? null : metres(num(m.end_distance_m)!)],
  ];
  return items.filter(([, , v]) => v !== null).map(([key, label, value]) => ({ key, label, value: value! }));
}

// ---------- Timeline ----------

export interface TimelineItem {
  id: number;
  label: string;
  time: string;
  detail: string | null;
  tone: 'neutral' | 'live' | 'verified' | 'review' | 'danger';
}

const EVENT_TONE: Record<string, TimelineItem['tone']> = {
  started: 'live',
  ended: 'neutral',
  verified: 'verified',
  needs_review: 'review',
  approved: 'verified',
  rejected: 'danger',
  cancelled: 'neutral',
};

const IST_OFFSET_MS = 5.5 * 3_600_000;

/** "26 Sep 06:10" in IST. */
export function formatDateTimeIST(iso: string): string {
  const d = new Date(Date.parse(iso) + IST_OFFSET_MS);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${t.common.months[d.getUTCMonth()]} ${hh}:${mm}`;
}

export function timelineItems(
  events: { id: number; type: string; payload: unknown; created_at: string }[],
  reviewerName: string | null,
): TimelineItem[] {
  return events.map((e) => {
    const tone = EVENT_TONE[e.type];
    const label = tone ? pick(t.console.events, e.type, e.type) : e.type;
    const p = (e.payload && typeof e.payload === 'object' ? e.payload : {}) as Record<string, unknown>;
    let detail: string | null = null;
    if (e.type === 'ended' && typeof p.expected_points === 'number')
      detail = t.console.events.expectedPoints(p.expected_points);
    if (e.type === 'needs_review' && Array.isArray(p.reasons)) detail = p.reasons.join(', ');
    if ((e.type === 'approved' || e.type === 'rejected') && typeof p.note === 'string') {
      detail = `${reviewerName ? `${reviewerName}: ` : ''}${p.note}`;
    }
    return { id: e.id, label, time: formatDateTimeIST(e.created_at), detail, tone: tone ?? 'neutral' };
  });
}
