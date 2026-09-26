import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radius, sizes, space, type } from '@/theme/tokens';

import { Text } from './Text';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string;
  hint?: string;
  /** Fixed prefix inside the field, e.g. "+91". */
  prefix?: string;
}

export function TextField({ label, error, hint, prefix, onFocus, onBlur, ...input }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text variant="bodyStrong">{label}</Text>
      <View style={[styles.field, focused && styles.focused, !!error && styles.error]}>
        {prefix ? (
          <View style={styles.prefix}>
            <Text tone="secondary">{prefix}</Text>
          </View>
        ) : null}
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={colors.disabled}
          {...input}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={styles.input}
        />
      </View>
      {error ? (
        <Text variant="caption" tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="secondary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: sizes.touchMin,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.input,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  focused: { borderColor: colors.primary },
  error: { borderColor: colors.danger },
  prefix: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: space.md,
    backgroundColor: colors.surfaceMuted,
  },
  input: {
    ...type.body,
    flex: 1,
    color: colors.text,
    paddingHorizontal: space.md,
    minHeight: sizes.touchMin,
    outlineWidth: 0,
  },
});
