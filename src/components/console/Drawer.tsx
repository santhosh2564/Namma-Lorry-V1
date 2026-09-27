import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { Modal as RNModal, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, fonts, fontSize, shadows, spacing, zIndex } from "@/theme/tokens";

export type DrawerProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Right-side slide-over used for filters and row detail on the console. */
export function Drawer({
  visible,
  onClose,
  title,
  children,
  width = 400,
  style,
  testID,
}: DrawerProps) {
  return (
    <RNModal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
      testID={testID}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityLabel="Close"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.backdrop}
        />
        <View style={[styles.panel, { width }, style]}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable accessibilityLabel="Close" accessibilityRole="button" onPress={onClose}>
              <Text style={styles.close}>{"✕"}</Text>
            </Pressable>
          </View>
          <View style={styles.body}>{children}</View>
        </View>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: "row", justifyContent: "flex-end", zIndex: zIndex.overlay },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlay,
  },
  panel: {
    height: "100%",
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.md,
    maxWidth: "92%",
    ...shadows.raised,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: fonts.semibold, fontSize: fontSize.subtitle, color: colors.text },
  close: { fontFamily: fonts.regular, fontSize: fontSize.subtitle, color: colors.textSecondary },
  body: { gap: spacing.md },
});
