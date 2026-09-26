// C1 Live Dashboard rules (docs/12 C1), pure and unit-tested.
import type { LatLng } from '@/lib/geo';

/** A live trip with no position update for this long is "stale" (red, "No recent data"). */
export const STALE_MS = 15 * 60_000;
const IST_OFFSET_MS = 5.5 * 3_600_000;

export interface LiveSource {
  id: string;
  started_at: string | null;
  driver: { full_name: string } | null;
  vehicle: { registration_no: string } | null;
  load: { load_code: string; pickup_address: string; drop_address: string } | null;
  live: { lat: number; lng: number; heading: number | null; recorded_at: string } | null;
}

export interface LiveRow {
  tripId: string;
  driver: string;
  vehicle: string;
  loadCode: string;
  route: string;
  position: LatLng | null;
  heading: number | null;
  /** ms since the last recorded point; null = no point yet. */
  ageMs: number | null;
  stale: boolean;
}

const short = (a: string) => a.split(',')[0]!.trim();

export function liveRows(trips: LiveSource[], now: number): LiveRow[] {
  const rows = trips.map((t): LiveRow => {
    const lastAt = t.live ? Date.parse(t.live.recorded_at) : null;
    // No point at all counts from the start time, so a trip that never reported also goes red.
    const ref = lastAt ?? (t.started_at ? Date.parse(t.started_at) : null);
    const ageMs = lastAt === null ? null : Math.max(0, now - lastAt);
    return {
      tripId: t.id,
      driver: t.driver?.full_name ?? '—',
      vehicle: t.vehicle?.registration_no ?? '—',
      loadCode: t.load?.load_code ?? '—',
      route: t.load ? `${short(t.load.pickup_address)} → ${short(t.load.drop_address)}` : '—',
      position: t.live ? { lat: t.live.lat, lng: t.live.lng } : null,
      heading: t.live?.heading ?? null,
      ageMs,
      stale: ref !== null && now - ref > STALE_MS,
    };
  });
  // Stale first (they need attention), then the most recently updated.
  return rows.sort(
    (a, b) => Number(b.stale) - Number(a.stale) || (a.ageMs ?? Infinity) - (b.ageMs ?? Infinity),
  );
}

/** "40 s ago", "18 min ago", "2 h ago", "3 d ago". */
export function ageText(ms: number | null): string {
  if (ms === null) return 'No data yet';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

export function filterLiveRows(rows: LiveRow[], q: string): LiveRow[] {
  const needle = q.trim().toLowerCase().replace(/\s+/g, '');
  if (!needle) return rows;
  return rows.filter((r) =>
    [r.driver, r.vehicle, r.loadCode, r.route].some((v) =>
      v.toLowerCase().replace(/\s+/g, '').includes(needle),
    ),
  );
}

export interface Kpis {
  live: number;
  stale: number;
  assignedToday: number | null;
  needReview: number | null;
}

export function kpis(rows: LiveRow[], assignedToday: number | null, needReview: number | null): Kpis {
  return { live: rows.length, stale: rows.filter((r) => r.stale).length, assignedToday, needReview };
}

/** Start of today in IST as an ISO timestamp (for "assigned today"). */
export function istMidnightIso(now: number): string {
  const ist = now + IST_OFFSET_MS;
  const midnightIst = ist - (ist % 86_400_000);
  return new Date(midnightIst - IST_OFFSET_MS).toISOString();
}

type LiveCols = NonNullable<LiveSource['live']>;

/**
 * Applies a realtime `trip_live` change to the cached list. Returns null when the change
 * can't be applied locally (a trip we don't have yet, or a delete = trip ended) → refetch.
 */
export function applyLiveChange<T extends LiveSource>(
  trips: T[],
  change: { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new: Record<string, unknown> },
): T[] | null {
  if (change.eventType === 'DELETE') return null;
  const tripId = change.new.trip_id as string | undefined;
  const idx = trips.findIndex((t) => t.id === tripId);
  if (!tripId || idx < 0) return null;
  const n = change.new;
  const live: LiveCols = {
    lat: Number(n.lat),
    lng: Number(n.lng),
    heading: n.heading === null || n.heading === undefined ? null : Number(n.heading),
    recorded_at: String(n.recorded_at),
  };
  const prev = trips[idx]!.live;
  // Out-of-order delivery: never move a marker back in time.
  if (prev && Date.parse(prev.recorded_at) > Date.parse(live.recorded_at)) return trips;
  const next = trips.slice();
  next[idx] = { ...trips[idx]!, live: { ...(prev ?? {}), ...live } };
  return next;
}
