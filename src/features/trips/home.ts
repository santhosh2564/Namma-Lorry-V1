// D3 My Trips sections (docs/12 D3), pure so the pinned/list/empty rules are tested.
import type { DriverTrip } from './api';

export interface HomeSections {
  /** Pinned "Trip in progress" card: the trip tracking on this phone, else one the server has in progress. */
  live: { id: string; trip: DriverTrip | null } | null;
  assigned: DriverTrip[];
  empty: boolean;
}

export function homeSections(
  trips: DriverTrip[] | undefined,
  localActiveTripId: string | null,
  /** Ended on this phone but not synced: the server still says in_progress, but it isn't live. */
  unsyncedTripId: string | null = null,
): HomeSections {
  const list = trips ?? [];
  const liveId =
    localActiveTripId ?? list.find((t) => t.status === 'in_progress' && t.id !== unsyncedTripId)?.id ?? null;
  const live = liveId ? { id: liveId, trip: list.find((t) => t.id === liveId) ?? null } : null;
  // Only one trip runs at a time (unique index), so any other in_progress row is stale; hide it.
  const assigned = list.filter((t) => t.status === 'assigned' && t.id !== liveId && t.id !== unsyncedTripId);
  return { live, assigned, empty: !live && assigned.length === 0 };
}

/** "Murugan S" → "Murugan". */
export function firstName(fullName: string | null | undefined): string {
  return (fullName ?? '').trim().split(/\s+/)[0] ?? '';
}
