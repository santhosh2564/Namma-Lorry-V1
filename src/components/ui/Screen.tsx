import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, spacing } from "@/theme/tokens";

export type ScreenProps = {
  children: ReactNode;
  /** Wrap content in a ScrollView (default: false, plain flex container). */
  scroll?: boolean;
  /** Background fill; defaults to the app background token. */
  background?: string;
  /** Horizontal padding, token key or raw number. */
  padded?: boolean;
  /** Shift content above the keyboard on iOS (no-op on Android/web). */
  avoidKeyboard?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Screen scaffold: safe-area aware, themed background and consistent padding.
 * Every route should render its content inside a `Screen`.
 */
export function Screen({
  children,
  scroll = false,
  background = colors.background,
  padded = true,
  avoidKeyboard = true,
  contentContainerStyle,
  style,
  testID,
}: ScreenProps) {
  const padding = padded ? { padding: spacing.md } : undefined;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: background }, style]} testID={testID}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        enabled={avoidKeyboard}
        style={styles.fill}
      >
        {scroll ? (
          <ScrollView
            contentContainerStyle={[styles.scrollContent, padding, contentContainerStyle]}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.content, padding, contentContainerStyle]}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  fill: { flex: 1 },
  content: { flex: 1 },
  scrollContent: { flexGrow: 1 },
});
