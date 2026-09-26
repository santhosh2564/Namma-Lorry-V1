// D8 "Location & battery check" (docs/12 D8). Pure: what's wrong and where to fix it.
import { isLocationReady, type PermissionSnapshot } from './permissionModel';

export type HealthIssue = 'location' | 'gps-off' | 'battery';

export interface Health {
  ok: boolean;
  issues: HealthIssue[];
  /** Screen that fixes the first issue (D1 for permissions / GPS, D2 for battery). */
  fixHref: '/permissions' | '/battery';
}

/** Notifications are optional (ND-30), so they don't make the check fail. */
export function healthCheck(s: PermissionSnapshot, batterySetupNeeded: boolean): Health {
  const issues: HealthIssue[] = [];
  if (!isLocationReady(s)) issues.push('location');
  if (!s.servicesEnabled) issues.push('gps-off');
  if (batterySetupNeeded) issues.push('battery');
  const fixHref = issues[0] === 'battery' ? '/battery' : '/permissions';
  return { ok: issues.length === 0, issues, fixHref };
}

/** "Murugan S" → "MS"; "" → "?". */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0]![0] ?? '') + (parts.length > 1 ? (parts.at(-1)![0] ?? '') : '')).toUpperCase();
}
