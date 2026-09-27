import { MaterialIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, sizes, space } from '@/theme/tokens';

import { Text } from './Text';

type Variant = 'primary' | 'danger' | 'dangerOutline' | 'success' | 'outline' | 'text';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  /** `driver` is the 64 px full-width driver primary action. */
  size?: 'default' | 'driver';
  disabled?: boolean;
  loading?: boolean;
  icon?: ComponentProps<typeof MaterialIcons>['name'];
  accessibilityHint?: string;
  testID?: string;
}

const palette: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
  danger: { bg: colors.danger, fg: colors.onPrimary, border: colors.danger },
  success: { bg: colors.verifiedStrong, fg: colors.onPrimary, border: colors.verifiedStrong },
  outline: { bg: colors.surface, fg: colors.primary, border: colors.primary },
  dangerOutline: { bg: colors.surface, fg: colors.danger, border: colors.danger },
  text: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'default',
  disabled = false,
  loading = false,
  icon,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const inactive = disabled || loading;
  const p = palette[variant];
  const filled = variant !== 'outline' && variant !== 'dangerOutline' && variant !== 'text';
  const bg = inactive && filled ? colors.disabled : p.bg;
  const border = inactive && filled ? colors.disabled : inactive ? colors.border : p.border;
  const fg = inactive && !filled ? colors.textSecondary : p.fg;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg,
          borderColor: border,
          minHeight:
            size === 'driver'
              ? sizes.buttonDriverPrimary
              : variant === 'text'
                ? sizes.touchMin
                : sizes.button,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          <Text variant="bodyStrong" style={{ color: fg }}>
            {label}
          </Text>
          {icon ? <MaterialIcons name={icon} size={22} color={fg} /> : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.button,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    alignSelf: 'stretch',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
