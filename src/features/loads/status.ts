// Status chips for the console: text + colour + icon, never colour alone (DESIGN.md).
// Trip labels are the "Console label" column of docs/06 §5.
import type { ComponentProps } from 'react';
import type { MaterialIcons } from '@expo/vector-icons';

import type { ChipTone } from '@/components/ui';

import type { LoadStatus, TripStatus } from './schemas';
import { t } from '@/i18n';

type Icon = ComponentProps<typeof MaterialIcons>['name'];
export interface ChipSpec {
  label: string;
  tone: ChipTone;
  icon: Icon;
}

/** The label is read when rendered, so it follows the current language. */
const chip = (label: () => string, tone: ChipTone, icon: Icon): ChipSpec => ({
  get label() {
    return label();
  },
  tone,
  icon,
});

const ts = t.console.tripStatus;
export const tripChip: Record<TripStatus, ChipSpec> = {
  assigned: chip(() => ts.assigned, 'neutral', 'assignment-ind'),
  in_progress: chip(() => ts.in_progress, 'live', 'sensors'),
  completed: chip(() => ts.completed, 'neutral', 'hourglass-top'),
  verified: chip(() => ts.verified, 'verified', 'verified'),
  needs_review: chip(() => ts.needs_review, 'review', 'warning-amber'),
  rejected: chip(() => ts.rejected, 'danger', 'cancel'),
  cancelled: chip(() => ts.cancelled, 'neutral', 'block'),
};

const ls = t.console.loadStatus;
export const loadChip: Record<LoadStatus, ChipSpec> = {
  unassigned: chip(() => ls.unassigned, 'accent', 'pending'),
  assigned: chip(() => ls.assigned, 'neutral', 'assignment-ind'),
  in_trip: chip(() => ls.in_trip, 'live', 'local-shipping'),
  done: chip(() => ls.done, 'verified', 'task-alt'),
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
