import { TRIP_STATUSES } from './schemas';
import { formatDistanceKm, formatDuration, formatEta, loadChipFor, tripChip, tripChipFor } from './status';

describe('status chips', () => {
  it('every trip status has a docs/06 §5 console label and an icon', () => {
    expect(TRIP_STATUSES.map((s) => tripChip[s].label)).toEqual([
      'Assigned',
      'Live',
      'Awaiting data',
      'Verified',
      'Needs review',
      'Rejected',
      'Cancelled',
    ]);
    for (const s of TRIP_STATUSES) expect(tripChip[s].icon).toBeTruthy();
  });

  it('falls back safely', () => {
    expect(tripChipFor('weird').label).toBe('weird');
    expect(loadChipFor(null).label).toBe('Unassigned');
    expect(loadChipFor('in_trip').label).toBe('In trip');
  });
});

describe('formatters', () => {
  it('duration', () => {
    expect(formatDuration('2026-09-26T06:10:00Z', '2026-09-26T15:52:00Z')).toBe('9h 42m');
    expect(formatDuration('2026-09-26T06:10:00Z', '2026-09-26T06:52:00Z')).toBe('42m');
    expect(formatDuration(null, null)).toBe('—');
  });
  it('distance', () => {
    expect(formatDistanceKm(511872)).toBe('512 km');
    expect(formatDistanceKm(800)).toBe('0.8 km');
    expect(formatDistanceKm(null)).toBe('—');
  });
  it('eta', () => {
    expect(formatEta(34813)).toBe('~10 h');
    expect(formatEta(2700)).toBe('~45 min');
  });
});
