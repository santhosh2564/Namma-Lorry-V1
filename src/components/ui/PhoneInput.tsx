import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, Text } from "react-native";

import { TextField } from "./TextField";
import { borderWidth, colors, fonts, fontSize, spacing } from "@/theme/tokens";

export type PhoneInputProps = {
  /** 10-digit national number (without the +91 country code). */
  value: string;
  onChangeText: (value: string) => void;
  errorText?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Indian mobile number input: fixed "+91" prefix, 10 digits, numeric keypad. */
export function PhoneInput({
  value,
  onChangeText,
  errorText,
  disabled = false,
  style,
  testID,
}: PhoneInputProps) {
  return (
    <TextField
      disabled={disabled}
      errorText={errorText}
      keyboardType="number-pad"
      label="Mobile number"
      maxLength={10}
      onChangeText={(text) => onChangeText(text.replace(/[^0-9]/g, "").slice(0, 10))}
      placeholder="98765 43210"
      prefix={
        <Text style={styles.prefix}>
          +91
          <Text style={styles.divider}>{"  "}</Text>
        </Text>
      }
      style={style}
      testID={testID}
      value={value}
    />
  );
}

const styles = StyleSheet.create({
  prefix: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.body,
    color: colors.text,
    paddingRight: spacing.sm,
    borderRightWidth: borderWidth.hairline,
    borderRightColor: colors.border,
  },
  divider: { color: colors.textSecondary },
});
