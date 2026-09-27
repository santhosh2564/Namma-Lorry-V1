import { addDriverSchema } from './schemas';

describe('addDriverSchema', () => {
  it('trims the name and normalises the phone', () => {
    expect(
      addDriverSchema.parse({ fullName: '  Selvam R ', phone: '+91 98400 12345', preferredLanguage: 'ta' }),
    ).toEqual({
      fullName: 'Selvam R',
      phone: '9840012345',
      preferredLanguage: 'ta',
    });
  });

  it('rejects short names, bad phones and unknown languages', () => {
    const r = addDriverSchema.safeParse({ fullName: 'S', phone: '12345', preferredLanguage: 'fr' });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path[0]).sort()).toEqual(['fullName', 'phone', 'preferredLanguage']);
  });
});
