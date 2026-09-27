import type { ReactNode } from "react";
import { useState } from "react";
import type { KeyboardTypeOptions, StyleProp, ViewStyle } from "react-native";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { Icon } from "./Icon";
import { borderWidth, colors, fonts, fontSize, radii, spacing, touch } from "@/theme/tokens";

export type TextFieldProps = {
  label?: string;
  value: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  helperText?: string;
  errorText?: string;
  disabled?: boolean;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoFocus?: boolean;
  maxLength?: number;
  multiline?: boolean;
  /** Material Symbols ligature for the leading icon, or a custom node. */
  icon?: string;
  /** Leading element, e.g. the "+91" prefix segment in PhoneInput. */
  prefix?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  onBlur?: () => void;
};

/** Labelled text input with focus, disabled and error states. */
export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  helperText,
  errorText,
  disabled = false,
  secureTextEntry = false,
  keyboardType,
  autoFocus = false,
  maxLength,
  multiline = false,
  icon,
  prefix,
  style,
  testID,
  onBlur,
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const invalid = Boolean(errorText);

  const borderColor = invalid ? colors.rejected : focused ? colors.primary : colors.border;

  return (
    <View style={[styles.wrapper, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.field,
          { borderColor },
          focused ? styles.fieldFocused : null,
          disabled ? styles.fieldDisabled : null,
          multiline ? styles.fieldMultiline : null,
        ]}
      >
        {prefix}
        {icon ? <Icon name={icon} size={20} color={colors.textSecondary} /> : null}
        <TextInput
          accessibilityLabel={label}
          autoFocus={autoFocus}
          editable={!disabled}
          keyboardType={keyboardType}
          maxLength={maxLength}
          multiline={multiline}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          placeholder={placeholder}
          placeholderTextColor={colors.textDisabled}
          secureTextEntry={secureTextEntry}
          style={[styles.input, multiline ? styles.inputMultiline : null]}
          testID={testID}
          value={value}
        />
      </View>
      {errorText ? (
        <Text style={styles.error}>{errorText}</Text>
      ) : helperText ? (
        <Text style={styles.helper}>{helperText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  label: { fontFamily: fonts.medium, fontSize: fontSize.caption, color: colors.textSecondary },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: touch.min,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: borderWidth.hairline,
    backgroundColor: colors.surface,
  },
  fieldFocused: { borderWidth: borderWidth.thick },
  fieldDisabled: { backgroundColor: colors.surfaceAlt, opacity: 0.6 },
  fieldMultiline: {
    minHeight: touch.min * 2,
    alignItems: "flex-start",
    paddingVertical: spacing.sm,
  },
  input: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: fontSize.body,
    color: colors.text,
    paddingVertical: spacing.sm,
  },
  inputMultiline: { textAlignVertical: "top" },
  helper: { fontFamily: fonts.regular, fontSize: fontSize.caption, color: colors.textSecondary },
  error: { fontFamily: fonts.medium, fontSize: fontSize.caption, color: colors.rejected },
});
