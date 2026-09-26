import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { colors, radius, sizes, space, type } from '@/theme/tokens';

import { Text } from './Text';

export interface PhoneInputProps {
  label: string;
  /** National number only (10 digits); "+91" is a fixed prefix. */
  value: string;
  onChangeText: (digits: string) => void;
  onBlur?: () => void;
  onSubmitEditing?: () => void;
  error?: string;
  clearLabel: string;
  editable?: boolean;
  testID?: string;
}

export function PhoneInput({
  label,
  value,
  onChangeText,
  onBlur,
  onSubmitEditing,
  error,
  clearLabel,
  editable = true,
  testID,
}: PhoneInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text variant="bodyStrong">{label}</Text>
      <View style={[styles.field, focused && styles.fieldFocused, error ? styles.fieldError : null]}>
        <View style={styles.prefix}>
          <Text variant="subtitle" tone="secondary">
            +91
          </Text>
        </View>
        <TextInput
          testID={testID}
          accessibilityLabel={label}
          value={value}
          onChangeText={(t) => onChangeText(t.replace(/\D/g, '').slice(0, 10))}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          onSubmitEditing={onSubmitEditing}
          editable={editable}
          keyboardType="phone-pad"
          inputMode="tel"
          textContentType="telephoneNumber"
          autoComplete="tel-national"
          maxLength={10}
          returnKeyType="done"
          placeholder="98xxx xxxxx"
          placeholderTextColor={colors.disabled}
          style={styles.input}
        />
        {value.length > 0 && editable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={clearLabel}
            onPress={() => onChangeText('')}
            hitSlop={8}
            style={styles.clear}
          >
            <MaterialIcons name="cancel" size={22} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text
          variant="caption"
          tone="danger"
          accessibilityRole="alert"
          testID={testID ? `${testID}-error` : undefined}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: sizes.button + 8,
    borderRadius: radius.input,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  fieldFocused: { borderColor: colors.primary },
  fieldError: { borderColor: colors.danger },
  prefix: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: space.md,
    backgroundColor: colors.border,
  },
  input: {
    ...type.subtitle,
    flex: 1,
    color: colors.text,
    paddingHorizontal: space.md,
    letterSpacing: 1,
    minHeight: sizes.touchMin,
    outlineWidth: 0, // web: the field border shows focus instead
  },
  clear: { padding: space.sm, marginRight: space.xs },
});
