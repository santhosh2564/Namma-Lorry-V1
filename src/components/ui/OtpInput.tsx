import { useRef } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, TextInput, View } from "react-native";

import { borderWidth, colors, fonts, radii, spacing } from "@/theme/tokens";

export type OtpInputProps = {
  /** Current code (up to `length` digits). */
  value: string;
  onChangeText: (value: string) => void;
  length?: number;
  /** Renders red borders (wrong / expired code). */
  invalid?: boolean;
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Six separate digit boxes; auto-advances and supports backspace. */
export function OtpInput({
  value,
  onChangeText,
  length = 6,
  invalid = false,
  autoFocus = false,
  style,
  testID,
}: OtpInputProps) {
  const refs = useRef<(TextInput | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  const setDigit = (index: number, char: string) => {
    const next = digits.slice();
    next[index] = char;
    onChangeText(
      next
        .join("")
        .replace(/[^0-9]/g, "")
        .slice(0, length),
    );
  };

  return (
    <View style={[styles.row, style]} testID={testID}>
      {digits.map((digit, index) => (
        <TextInput
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          accessibilityLabel={`Digit ${index + 1}`}
          autoFocus={autoFocus && index === 0}
          keyboardType="number-pad"
          maxLength={1}
          onChangeText={(text) => {
            const char = text.replace(/[^0-9]/g, "").slice(-1);
            setDigit(index, char);
            if (char && index < length - 1) {
              refs.current[index + 1]?.focus();
            }
          }}
          onKeyPress={(event) => {
            if (event.nativeEvent.key === "Backspace" && !digit && index > 0) {
              refs.current[index - 1]?.focus();
            }
          }}
          selectTextOnFocus
          style={[
            styles.box,
            { borderColor: invalid ? colors.rejected : digit ? colors.primary : colors.border },
          ]}
          value={digit}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm, justifyContent: "center" },
  box: {
    width: 48,
    height: 56,
    borderWidth: borderWidth.hairline,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    textAlign: "center",
    fontFamily: fonts.semibold,
    fontSize: 22,
    color: colors.text,
  },
});
