// Status chips for the console: text + colour + icon, never colour alone (DESIGN.md).
// Trip labels are the "Console label" column of docs/06 §5.
import type { ComponentProps } from 'react';
import type { MaterialIcons } from '@expo/vector-icons';

import type { ChipTone } from '@/components/ui';

import type { LoadStatus, TripStatus } from './schemas';

type Icon = ComponentProps<typeof MaterialIcons>['name'];
export interface ChipSpec {
  label: string;
  tone: ChipTone;
  icon: Icon;
}

export const tripChip: Record<TripStatus, ChipSpec> = {
  assigned: { label: 'Assigned', tone: 'neutral', icon: 'assignment-ind' },
  in_progress: { label: 'Live', tone: 'live', icon: 'sensors' },
  completed: { label: 'Awaiting data', tone: 'neutral', icon: 'hourglass-top' },
  verified: { label: 'Verified', tone: 'verified', icon: 'verified' },
  needs_review: { label: 'Needs review', tone: 'review', icon: 'warning-amber' },
  rejected: { label: 'Rejected', tone: 'danger', icon: 'cancel' },
  cancelled: { label: 'Cancelled', tone: 'neutral', icon: 'block' },
};

export const loadChip: Record<LoadStatus, ChipSpec> = {
  unassigned: { label: 'Unassigned', tone: 'accent', icon: 'pending' },
  assigned: { label: 'Assigned', tone: 'neutral', icon: 'assignment-ind' },
  in_trip: { label: 'In trip', tone: 'live', icon: 'local-shipping' },
  done: { label: 'Done', tone: 'verified', icon: 'task-alt' },
};

export function tripChipFor(status: string): ChipSpec {
  return tripChip[status as TripStatus] ?? { label: status, tone: 'neutral', icon: 'help-outline' };
}

export function loadChipFor(status: string | null): ChipSpec {
  return loadChip[(status ?? 'unassigned') as LoadStatus] ?? loadChip.unassigned;
}

/** "9h 42m" / "42m" / "—". */
export function formatDuration(startIso: string | null, endIso: string | null): string {
  if (!startIso || !endIso) return '—';
  const mins = Math.max(0, Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60_000));
  const h = Math.floor(mins / 60);
  return h ? `${h}h ${String(mins % 60).padStart(2, '0')}m` : `${mins}m`;
}

/** metres → "512 km" / "0.8 km" / "—". */
export function formatDistanceKm(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  const km = m / 1000;
  return `${km >= 10 ? Math.round(km).toLocaleString('en-IN') : km.toFixed(1)} km`;
}

/** seconds → "~10 h" / "~45 min". */
export function formatEta(s: number | null | undefined): string {
  if (!s) return '—';
  return s >= 3600 ? `~${Math.round(s / 3600)} h` : `~${Math.max(1, Math.round(s / 60))} min`;
}
