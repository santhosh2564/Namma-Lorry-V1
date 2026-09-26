import type { TextStyle } from 'react-native';

// Design tokens from stitch/DESIGN.md (the brief palette wins over the Stitch export, ND-17).
// Screens must use these tokens, never raw hex values.

export const colors = {
  primary: '#0F2A44', // Ink Navy
  onPrimary: '#FFFFFF',
  onPrimaryMuted: 'rgba(255,255,255,0.7)',
  accent: '#F5A300', // Highway Amber
  accentSoft: '#FFF4DC',
  verified: '#1E8E3E',
  review: '#E37400',
  danger: '#D93025',
  dangerSoft: '#FCE8E6',
  live: '#1A73E8',
  background: '#F6F7F9',
  surface: '#FFFFFF',
  surfaceMuted: '#EEF1F5',
  border: '#E3E6EA',
  text: '#1B1F24',
  textSecondary: '#5F6B7A',
  disabled: '#B8C0CA',
} as const;

export const fonts = {
  regular: 'NotoSans_400Regular',
  medium: 'NotoSans_500Medium',
  semibold: 'NotoSans_600SemiBold',
  bold: 'NotoSans_700Bold',
} as const;

// Mobile type scale: title 22/28 semibold, body 16/24, caption 13/18.
export const type = {
  display: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 36 },
  title: { fontFamily: fonts.semibold, fontSize: 22, lineHeight: 28 },
  subtitle: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 24 },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  digit: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 34, fontVariant: ['tabular-nums'] },
} satisfies Record<string, TextStyle>;

/** 8 px grid. */
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

export const radius = { button: 12, card: 16, chip: 999, input: 12 } as const;

export const sizes = {
  touchMin: 48,
  button: 56,
  buttonDriverPrimary: 64,
  otpBox: 56,
  maxContentWidth: 480,
} as const;

export const shadow = {
  card: {
    shadowColor: '#0F2A44',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
} as const;
