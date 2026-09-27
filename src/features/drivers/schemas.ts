import { z } from 'zod';

import { nationalPhoneSchema } from '@/features/auth/schemas';

export const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'ta', label: 'தமிழ் Tamil' },
  { value: 'kn', label: 'ಕನ್ನಡ Kannada' },
  { value: 'hi', label: 'हिन्दी Hindi' },
] as const;
export type Language = (typeof LANGUAGES)[number]['value'];

export const addDriverSchema = z.object({
  fullName: z.string().trim().min(2, 'name_required').max(80, 'name_too_long'),
  phone: nationalPhoneSchema,
  preferredLanguage: z.enum(['en', 'ta', 'kn', 'hi']),
});

export type AddDriverInput = z.input<typeof addDriverSchema>;
export type AddDriverValues = z.output<typeof addDriverSchema>;
