import { Text as RNText, type TextProps } from 'react-native';

import { colors, type } from '@/theme/tokens';

type Variant = keyof typeof type;
type Tone = 'default' | 'secondary' | 'danger' | 'onPrimary' | 'onPrimaryMuted';

const toneColor: Record<Tone, string> = {
  default: colors.text,
  secondary: colors.textSecondary,
  danger: colors.danger,
  onPrimary: colors.onPrimary,
  onPrimaryMuted: colors.onPrimaryMuted,
};

export interface AppTextProps extends TextProps {
  variant?: Variant;
  tone?: Tone;
  align?: 'left' | 'center' | 'right';
}

export function Text({ variant = 'body', tone = 'default', align, style, ...rest }: AppTextProps) {
  return <RNText {...rest} style={[type[variant], { color: toneColor[tone], textAlign: align }, style]} />;
}
