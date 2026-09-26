import { Text as RNText, type TextProps } from 'react-native';

import { colors, type } from '@/theme/tokens';

type Variant = keyof typeof type;
type Tone = 'default' | 'secondary' | 'danger' | 'onPrimary' | 'onPrimaryMuted';

const toneColor: Record<Tone, string> = {
  default: colors.text,
  secondary: colors.textSecondary,
  danger: colors.dangerText,
  onPrimary: colors.onPrimary,
  onPrimaryMuted: colors.onPrimaryMuted,
};

export interface AppTextProps extends TextProps {
  variant?: Variant;
  tone?: Tone;
  align?: 'left' | 'center' | 'right';
}

/**
 * System font scaling is respected (accessibility), but big display text is capped so it can't
 * push a screen's controls out of reach; body and caption text scale up to 200 %.
 */
export const MAX_FONT_SCALE: Record<Variant, number> = {
  display: 1.4,
  digit: 1.4,
  title: 1.6,
  subtitle: 1.8,
  body: 2,
  bodyStrong: 2,
  caption: 2,
};

export function Text({ variant = 'body', tone = 'default', align, style, ...rest }: AppTextProps) {
  return (
    <RNText
      maxFontSizeMultiplier={MAX_FONT_SCALE[variant]}
      {...rest}
      style={[type[variant], { color: toneColor[tone], textAlign: align }, style]}
    />
  );
}
