import { z } from 'zod';

import { parseRegistration } from './registration';

/** Vehicle types offered on C9 (docs/04 C10, docs/12 C9). Stored values match the seed ('19ft', '407', …). */
export const VEHICLE_TYPES = [
  { value: '407', label: '407' },
  { value: '14ft', label: '14 ft' },
  { value: '17ft', label: '17 ft' },
  { value: '19ft', label: '19 ft' },
  { value: '20ft', label: '20 ft' },
  { value: '22ft', label: '22 ft' },
  { value: '24ft', label: '24 ft' },
  { value: 'multi-axle', label: 'Multi-axle' },
] as const;

export type VehicleType = (typeof VEHICLE_TYPES)[number]['value'];

export function vehicleTypeLabel(value: string): string {
  return VEHICLE_TYPES.find((t) => t.value === value)?.label ?? value;
}

export const addVehicleSchema = z.object({
  registrationNo: z.string().transform((v, ctx) => {
    const r = parseRegistration(v);
    if (!r.ok) {
      ctx.addIssue({ code: 'custom', message: 'invalid_registration' });
      return z.NEVER;
    }
    return r.formatted;
  }),
  vehicleType: z.enum(VEHICLE_TYPES.map((t) => t.value) as [VehicleType, ...VehicleType[]], {
    message: 'type_required',
  }),
});

export type AddVehicleInput = z.input<typeof addVehicleSchema>;
export type AddVehicleValues = z.output<typeof addVehicleSchema>;
