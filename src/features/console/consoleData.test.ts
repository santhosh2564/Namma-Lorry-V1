import { buildDriverRows, buildVehicleRows, formatPhone, matchesSearch, routeSearch } from './consoleData';

const trips = [
  {
    driver_id: 'd1',
    vehicle_id: 'v1',
    status: 'verified',
    started_at: '2026-09-20T06:00:00Z',
    ended_at: '2026-09-20T15:00:00Z',
  },
  {
    driver_id: 'd1',
    vehicle_id: 'v1',
    status: 'in_progress',
    started_at: '2026-09-26T06:00:00Z',
    ended_at: null,
  },
  {
    driver_id: 'd2',
    vehicle_id: 'v2',
    status: 'needs_review',
    started_at: '2026-09-22T06:00:00Z',
    ended_at: '2026-09-22T09:00:00Z',
  },
  { driver_id: 'd2', vehicle_id: 'v2', status: 'assigned', started_at: null, ended_at: null },
];

describe('buildDriverRows', () => {
  const rows = buildDriverRows(
    [
      { id: 'd1', full_name: 'Murugan S', phone: '919000000011', is_active: true },
      { id: 'd2', full_name: 'Ravi Kumar', phone: '919000000012', is_active: true },
      { id: 'd3', full_name: '', phone: null, is_active: false },
    ],
    [{ driver_id: 'd1', verified_trips: 38, verified_distance_m: 14_860_449 }],
    trips,
  );

  it('uses server stats only, in km', () => {
    expect(rows[0]).toMatchObject({ verifiedTrips: 38, verifiedKm: 14860.4 });
    expect(rows[1]).toMatchObject({ verifiedTrips: 0, verifiedKm: 0 });
  });

  it('derives status: on trip / available / inactive', () => {
    expect(rows.map((r) => r.status)).toEqual(['on_trip', 'available', 'inactive']);
  });

  it('last trip = latest end or start time; none for never-started', () => {
    expect(rows[0]!.lastTripAt).toBe('2026-09-26T06:00:00Z');
    expect(rows[1]!.lastTripAt).toBe('2026-09-22T09:00:00Z');
    expect(rows[2]!.lastTripAt).toBeNull();
  });

  it('formats phone and blank names', () => {
    expect(rows[0]!.phone).toBe('+91 90000 00011');
    expect(rows[2]).toMatchObject({ fullName: '—', phone: '—' });
  });
});

describe('buildVehicleRows', () => {
  it('counts trips, last use, status and owner', () => {
    const rows = buildVehicleRows(
      [
        { id: 'v1', registration_no: 'TN 23 BK 4521', vehicle_type: '19ft', owner: null },
        {
          id: 'v2',
          registration_no: 'KA 01 AF 7788',
          vehicle_type: '14ft',
          owner: { full_name: 'Sri Transports' },
        },
        { id: 'v3', registration_no: 'TN 70 C 3310', vehicle_type: '407', owner: null },
      ],
      trips,
    );
    expect(rows.map((r) => [r.trips, r.lastUsedAt, r.status, r.ownerName])).toEqual([
      [2, '2026-09-26T06:00:00Z', 'on_trip', null],
      [2, '2026-09-22T06:00:00Z', 'available', 'Sri Transports'],
      [0, null, 'available', null],
    ]);
  });
});

describe('formatPhone', () => {
  it.each([
    ['919840012345', '+91 98400 12345'],
    ['+919840012345', '+91 98400 12345'],
    ['9840012345', '+91 98400 12345'],
    ['12345', '12345'],
  ])('%s → %s', (a, b) => expect(formatPhone(a)).toBe(b));
});

describe('matchesSearch', () => {
  it('matches names, phones and plates ignoring case and spaces', () => {
    expect(matchesSearch('murugan', 'Murugan S')).toBe(true);
    expect(matchesSearch('9000000011', '+91 90000 00011')).toBe(true);
    expect(matchesSearch('tn23bk', 'TN 23 BK 4521')).toBe(true);
    expect(matchesSearch('ravi', 'Murugan S', '+91 90000 00011')).toBe(false);
    expect(matchesSearch('  ', 'anything')).toBe(true);
  });
});

describe('routeSearch', () => {
  it.each([
    ['NL-2026-000142', '/console/loads'],
    ['nl-2026', '/console/loads'],
    ['TN 23 BK 4521', '/console/vehicles'],
    ['tn23', '/console/vehicles'],
    ['22 BH 1234 AA', '/console/vehicles'],
    ['Murugan', '/console/drivers'],
    ['98400', '/console/drivers'],
  ])('%s → %s', (q, path) => expect(routeSearch(q)?.path).toBe(path));

  it('ignores empty input', () => expect(routeSearch('  ')).toBeNull());
});
