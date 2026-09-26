import { maskPhone, nationalPhoneSchema, otpSchema, toE164 } from './schemas';

describe('nationalPhoneSchema (+91)', () => {
  it.each(['9840234521', '98402 34521', '98402-34521', '+91 98402 34521', '919840234521', '09840234521', '6000000000'])(
    'accepts %s',
    (raw) => {
      expect(nationalPhoneSchema.safeParse(raw).success).toBe(true);
    },
  );

  it.each(['', '12345', '984023452', '98402345211', '5840234521', '0840234521', 'abcdefghij'])('rejects %s', (raw) => {
    expect(nationalPhoneSchema.safeParse(raw).success).toBe(false);
  });

  it('normalises to 10 digits and E.164', () => {
    expect(nationalPhoneSchema.parse('+91 98402 34521')).toBe('9840234521');
    expect(toE164('98402 34521')).toBe('+919840234521');
  });
});

describe('otpSchema', () => {
  it('accepts exactly 6 digits', () => {
    expect(otpSchema.safeParse('123456').success).toBe(true);
    expect(otpSchema.safeParse('12345').success).toBe(false);
    expect(otpSchema.safeParse('1234567').success).toBe(false);
    expect(otpSchema.safeParse('12a456').success).toBe(false);
  });
});

describe('maskPhone', () => {
  it('matches the S3 design format', () => {
    expect(maskPhone('+919840234521')).toBe('+91 98xxx x4521');
  });
});
