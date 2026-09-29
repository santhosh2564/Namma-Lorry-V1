/**
 * Design tokens — colours and sizes from the brief (stitch/DESIGN.md; ND-17: the
 * brief wins over the Stitch export palette). Added in M12a so screens stop using
 * raw hex values and so contrast can be tested (src/theme/__tests__/contrast.test.ts).
 * Typography, radii and the rest of the M2 token set are still to come.
 *
 * Status colours from the brief are for fills, icons and borders. As small text on
 * white, amber (2.1:1), review orange (3.1:1) and verified green (4.2:1) fail WCAG AA
 * and live blue only just passes (4.5:1), so text uses the darker `*Text` variants.
 */
export const colors = {
  primary: '#0F2A44', // Ink Navy — headers, primary buttons, active tab
  accent: '#F5A300', // Highway Amber — lorry marker, highlights, Load ID chips (never text on light)
  background: '#F6F7F9',
  surface: '#FFFFFF',
  border: '#E3E6EA',
  text: '#1B1F24',
  textSecondary: '#5F6B7A',
  onPrimary: '#FFFFFF',

  verified: '#1E8E3E',
  review: '#E37400',
  danger: '#D93025',
  live: '#1A73E8',

  verifiedText: '#18712F',
  reviewText: '#A35200',
  dangerText: '#B3261E',
  liveText: '#1558B0',

  verifiedSoft: '#E6F4EA',
  reviewSoft: '#FEF3E6',
  dangerSoft: '#FCE8E6',
  liveSoft: '#E8F0FE',
  primarySoft: '#E7ECF2',

  mapSurface: '#E9EEF2',
  plannedRoute: '#8A96A3',
  scrim: 'rgba(15, 42, 68, 0.4)',
} as const;

export const sizes = {
  /** Minimum touch target (DESIGN.md, TRD §9). */
  minTouch: 48,
  /** Driver primary buttons are 56–64 px tall. */
  driverPrimary: 56,
} as const;

export type ColorToken = keyof typeof colors;
