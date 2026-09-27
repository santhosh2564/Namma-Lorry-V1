import { z } from 'zod';

/**
 * Indian mobile number as typed after the fixed "+91" prefix.
 * Spaces/dashes are ignored; a pasted "+91", "91" or leading "0" is stripped.
 * Valid mobiles are 10 digits starting 6–9.
 */
export const nationalPhoneSchema = z
  .string()
  .transform((raw) => {
    let d = raw.replace(/\D/g, '');
    if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
    else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
    return d;
  })
  .pipe(z.string().regex(/^[6-9]\d{9}$/, { message: 'invalid_phone' }));

export const signInSchema = z.object({ phone: nationalPhoneSchema });
export type SignInForm = z.input<typeof signInSchema>;

export const otpSchema = z.string().regex(/^\d{6}$/, { message: 'invalid_code' });

/** E.164 for Supabase Auth: "+91XXXXXXXXXX". */
export function toE164(national: string): string {
  return `+91${nationalPhoneSchema.parse(national)}`;
}

/** "+91 98xxx x4521" — enough to recognise the number without exposing it. */
export function maskPhone(e164: string): string {
  const d = e164.replace(/\D/g, '').slice(-10);
  if (d.length !== 10) return e164;
  return `+91 ${d.slice(0, 2)}xxx x${d.slice(6)}`;
}
