/**
 * Design tokens for Namma Lorry (M2).
 *
 * Single source of truth for colour, type, spacing, shape and elevation,
 * taken from `stitch/DESIGN.md` / docs/12 §4. Screens and components must use
 * these tokens — no raw hex values anywhere outside this file.
 *
 * Palette per ND-17: the design brief wins over the Stitch M3 token export.
 */
import type { TextStyle } from "react-native";

/** Colour system. Named by role, not by hue, so themes can be swapped later. */
export const colors = {
  // Brand
  primary: "#0F2A44", // Ink Navy — headers, primary buttons, active tab
  primaryPressed: "#0A1F33",
  primaryMuted: "#E7ECF2",
  onPrimary: "#FFFFFF",

  accent: "#F5A300", // Highway Amber — lorry marker, highlights, Load ID chips
  accentPressed: "#D98F00",
  accentMuted: "#FDF0D6",
  onAccent: "#0F2A44",

  // Status
  verified: "#1E8E3E",
  verifiedMuted: "#E6F4EA",
  verifiedPressed: "#17742F",
  review: "#E37400",
  reviewMuted: "#FCEEDD",
  rejected: "#D93025",
  rejectedMuted: "#FCE8E6",
  rejectedPressed: "#B72620",
  live: "#1A73E8",
  liveMuted: "#E8F0FE",
  neutral: "#5F6B7A",
  neutralMuted: "#EEF1F4",

  // Surfaces & text
  background: "#F6F7F9",
  surface: "#FFFFFF",
  surfaceAlt: "#FBFCFD",
  border: "#E3E6EA",
  borderStrong: "#CBD2DA",
  text: "#1B1F24",
  textSecondary: "#5F6B7A",
  textDisabled: "#9AA4B0",
  textInverse: "#FFFFFF",
  textInverseMuted: "rgba(255, 255, 255, 0.7)",
  textInverseSubtle: "rgba(255, 255, 255, 0.5)",

  // Feedback
  info: "#1A73E8",
  warning: "#E37400",
  danger: "#D93025",
  success: "#1E8E3E",

  // Misc
  overlay: "rgba(15, 42, 68, 0.45)",
  transparent: "transparent",
} as const;

export type ColorToken = keyof typeof colors;

/** Font family names registered by `src/theme/fonts.ts` via expo-font. */
export const fonts = {
  regular: "NotoSans_400Regular",
  medium: "NotoSans_500Medium",
  semibold: "NotoSans_600SemiBold",
  bold: "NotoSans_700Bold",
  /** Material Symbols (ND-16) — rendered as ligatures by the Icon component. */
  icon: "MaterialSymbols_400Regular",
} as const;

export const fontSize = {
  caption: 13,
  body: 16,
  subtitle: 18,
  title: 22,
  heading: 28,
  display: 34,
} as const;

export const lineHeight = {
  caption: 18,
  body: 24,
  subtitle: 26,
  title: 28,
  heading: 34,
  display: 40,
} as const;

/** Reusable text styles. Numbers use tabular figures (DESIGN.md). */
export const textStyles: Record<string, TextStyle> = {
  caption: {
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
  },
  bodyStrong: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
  },
  subtitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.subtitle,
    lineHeight: lineHeight.subtitle,
  },
  title: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
  },
  heading: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.heading,
    lineHeight: lineHeight.heading,
  },
  number: {
    fontFamily: fonts.bold,
    fontSize: fontSize.heading,
    lineHeight: lineHeight.heading,
    fontVariant: ["tabular-nums"],
  },
};

/** 8 px spacing grid. */
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
  xxxl: 48,
  huge: 64,
} as const;

export const radii = {
  none: 0,
  sm: 8,
  button: 12,
  md: 12,
  lg: 16,
  card: 16,
  xl: 24,
  chip: 999,
} as const;

export const borderWidth = {
  none: 0,
  hairline: 1,
  thick: 2,
} as const;

/** Minimum touch target 48 px; driver CTAs 56–64 px (DESIGN.md). */
export const touch = {
  min: 48,
  cta: 56,
  driverPrimary: 64,
} as const;

/** Elevation / shadow presets (RN props + Android elevation). */
export const shadows = {
  none: {
    shadowColor: colors.transparent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  card: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  raised: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  sheet: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 12,
  },
} as const;

/** Layout constants for the web console shell (docs/12 §6). */
export const layout = {
  sidebarWidth: 240,
  topBarHeight: 64,
  contentMaxWidth: 1440,
} as const;

export const zIndex = {
  base: 0,
  banner: 10,
  sticky: 20,
  overlay: 100,
  sheet: 110,
} as const;

export const tokens = {
  colors,
  fonts,
  fontSize,
  lineHeight,
  textStyles,
  spacing,
  radii,
  borderWidth,
  touch,
  shadows,
  layout,
  zIndex,
} as const;
