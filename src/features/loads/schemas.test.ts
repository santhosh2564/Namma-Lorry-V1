import { assignSchema, createLoadSchema, ilikeTerm, rangeStart, toLoadInsert } from './schemas';

const pickup = {
  address: 'SIPCOT Industrial Park, Sriperumbudur',
  lat: 12.9563,
  lng: 79.9422,
  eLoc: 'A1B2C3',
  radiusM: 500,
};
const drop = {
  address: 'Kurichi Industrial Estate, Coimbatore',
  lat: 10.9608,
  lng: 76.9656,
  eLoc: null,
  radiusM: 800,
};
const base = { pickup, drop, material: ' Auto parts ', weightTonnes: '6.5', shipperId: null, notes: '' };

describe('createLoadSchema', () => {
  it('parses and maps to a loads row (tonnes → kg, blanks → null)', () => {
    const v = createLoadSchema.parse(base);
    expect(toLoadInsert(v, 511872)).toEqual({
      pickup_address: pickup.address,
      pickup_lat: 12.9563,
      pickup_lng: 79.9422,
      pickup_radius_m: 500,
      drop_address: drop.address,
      drop_lat: 10.9608,
      drop_lng: 76.9656,
      drop_radius_m: 800,
      planned_distance_m: 511872,
      material: 'Auto parts',
      weight_kg: 6500,
      shipper_id: null,
      notes: null,
    });
  });

  it('allows empty optional fields', () => {
    const v = createLoadSchema.parse({ ...base, material: '', weightTonnes: '' });
    expect([v.material, v.weightTonnes]).toEqual([null, null]);
  });

  it.each([
    [{ ...base, pickup: { ...pickup, radiusM: 50 } }, 'radius_range'],
    [{ ...base, pickup: { ...pickup, radiusM: 2500 } }, 'radius_range'],
    [{ ...base, weightTonnes: 'abc' }, 'weight_range'],
    [{ ...base, weightTonnes: '0' }, 'weight_range'],
    [{ ...base, drop: { ...drop, address: '' } }, 'address_required'],
    [{ ...base, drop: { ...drop, lat: pickup.lat, lng: pickup.lng } }, 'same_as_pickup'],
    [{ ...base, pickup: { ...pickup, lat: undefined } }, 'location_required'],
    [{ ...base, shipperId: 'nope' }, undefined],
  ])('rejects %#', (input, message) => {
    const r = createLoadSchema.safeParse(input);
    expect(r.success).toBe(false);
    if (message) expect(r.error?.issues.map((i) => i.message)).toContain(message);
  });
});

describe('assignSchema', () => {
  it('requires both ids', () => {
    const r = assignSchema.safeParse({});
    expect(r.error?.issues.map((i) => i.message).sort()).toEqual(['driver_required', 'vehicle_required']);
    expect(
      assignSchema.safeParse({
        driverId: 'd0000000-0000-4000-8000-000000000001',
        vehicleId: 'c0000000-0000-4000-8000-000000000001',
      }).success,
    ).toBe(true);
  });
});

describe('rangeStart', () => {
  const now = new Date('2026-09-26T10:00:00Z'); // 15:30 IST
  it('today = 00:00 IST', () => expect(rangeStart('today', now)).toBe('2026-09-25T18:30:00.000Z'));
  it('7 days includes today', () => expect(rangeStart('7d', now)).toBe('2026-09-19T18:30:00.000Z'));
  it('all = no bound', () => expect(rangeStart('all', now)).toBeNull());
});

describe('ilikeTerm', () => {
  it('escapes wildcards and filter syntax', () => {
    expect(ilikeTerm(' NL-2026 ')).toBe('%NL-2026%');
    expect(ilikeTerm('50%_off')).toBe('%50\\%\\_off%');
    expect(ilikeTerm('a,b(c)')).toBe('%a b c %');
  });
});
