/**
 * Design tokens (M1 minimal seed).
 *
 * M2 expands this into the full token set from stitch/DESIGN.md
 * (typography scale, spacing grid, radii, shadows, status colours).
 * Palette per ND-17: the design brief wins over the Stitch M3 token file.
 */
export const colors = {
  primary: "#0F2A44", // Ink Navy
  primaryText: "#FFFFFF",
  accent: "#F5A300", // Highway Amber
  verified: "#1E8E3E",
  review: "#E37400",
  rejected: "#D93025",
  live: "#1A73E8",
  background: "#F6F7F9",
  surface: "#FFFFFF",
  border: "#E3E6EA",
  text: "#1B1F24",
  textSecondary: "#5F6B7A",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  card: 16,
  chip: 999,
} as const;

export const touch = {
  min: 48,
  driverPrimary: 64,
} as const;
