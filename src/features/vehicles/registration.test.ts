import { parseRegistration } from './registration';
import { addVehicleSchema, vehicleTypeLabel } from './schemas';

describe('parseRegistration', () => {
  it.each([
    ['TN 23 BK 4521', 'TN 23 BK 4521'],
    ['tn23bk4521', 'TN 23 BK 4521'],
    ['TN-23-BK-4521', 'TN 23 BK 4521'],
    ['TN 70 C 3310', 'TN 70 C 3310'],
    ['KA 01 AF 7788', 'KA 01 AF 7788'],
    ['KA51MA123', 'KA 51 MA 123'],
    ['MH 12 4521', 'MH 12 4521'],
    ['DL 1C AA 1234', 'DL 1C AA 1234'],
    ['DL 3C 1234', 'DL 3 C 1234'],
    ['TG 09 A 1', 'TG 09 A 1'],
    ['22 BH 1234 AA', '22 BH 1234 AA'],
    ['22bh1234a', '22 BH 1234 A'],
  ])('accepts %s → %s', (input, formatted) => {
    expect(parseRegistration(input)).toEqual({ ok: true, formatted });
  });

  it.each([
    '',
    'TN',
    'TN 23',
    'TN23', // ambiguous: needs a series or a 4-digit number
    'MH 12 452',
    'XX 23 BK 4521', // unknown state
    'TN 00 BK 4521', // RTO 0
    'TN 23 BK 0000', // number 0
    'TN 23 BKLM 4521', // 4-letter series
    'TN 234 BK 4521', // 3-digit RTO
    'TN 23 BK 45210', // 5-digit number
    '22 BH 123 AA',
    '22 BH 1234 IO',
    'ABCD',
  ])('rejects %s', (input) => {
    expect(parseRegistration(input)).toEqual({ ok: false });
  });
});

describe('addVehicleSchema', () => {
  it('normalises the registration and requires a known type', () => {
    expect(addVehicleSchema.parse({ registrationNo: 'tn23bk4521', vehicleType: '19ft' })).toEqual({
      registrationNo: 'TN 23 BK 4521',
      vehicleType: '19ft',
    });
    const bad = addVehicleSchema.safeParse({ registrationNo: 'nope', vehicleType: 'bus' });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues.map((i) => i.message).sort()).toEqual(['invalid_registration', 'type_required']);
  });

  it('labels types', () => {
    expect(vehicleTypeLabel('19ft')).toBe('19 ft');
    expect(vehicleTypeLabel('multi-axle')).toBe('Multi-axle');
    expect(vehicleTypeLabel('custom')).toBe('custom');
  });
});
