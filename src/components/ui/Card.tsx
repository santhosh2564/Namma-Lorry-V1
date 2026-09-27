import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { Pressable, StyleSheet, View } from "react-native";

import { borderWidth, colors, radii, shadows, spacing } from "@/theme/tokens";

export type CardProps = {
  children: ReactNode;
  /** Adds a pressed state and makes the whole card a single touch target. */
  onPress?: () => void;
  /** Accent stripe on the left edge (e.g. the pinned live-trip card). */
  accentColor?: string;
  padded?: boolean;
  elevated?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Surface container: radius 16, subtle border and optional elevation. */
export function Card({
  children,
  onPress,
  accentColor,
  padded = true,
  elevated = false,
  style,
  testID,
}: CardProps) {
  const base: StyleProp<ViewStyle> = [
    styles.card,
    elevated ? shadows.card : null,
    accentColor ? { borderLeftWidth: 4, borderLeftColor: accentColor } : null,
    padded ? styles.padded : null,
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        testID={testID}
        style={({ pressed }) => [...base, pressed ? styles.pressed : null]}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View style={base} testID={testID}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border,
  },
  padded: { padding: spacing.md },
  pressed: { backgroundColor: colors.surfaceAlt },
});
