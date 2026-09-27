import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { Modal as RNModal, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, fonts, fontSize, radii, shadows, spacing, zIndex } from "@/theme/tokens";

export type ConsoleModalProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Optional footer, e.g. Cancel/Save buttons. */
  footer?: ReactNode;
  width?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Centred dialog for the web console (Add Driver / Add Vehicle). */
export function ConsoleModal({
  visible,
  onClose,
  title,
  children,
  footer,
  width = 480,
  style,
  testID,
}: ConsoleModalProps) {
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
        <View style={[styles.dialog, { width }, style]}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable accessibilityLabel="Close" accessibilityRole="button" onPress={onClose}>
              <Text style={styles.close}>{"✕"}</Text>
            </Pressable>
          </View>
          <View style={styles.body}>{children}</View>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", zIndex: zIndex.overlay },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlay,
  },
  dialog: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
    maxWidth: "92%",
    ...shadows.raised,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: fonts.semibold, fontSize: fontSize.subtitle, color: colors.text },
  close: { fontFamily: fonts.regular, fontSize: fontSize.subtitle, color: colors.textSecondary },
  body: { gap: spacing.md },
  footer: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm },
});
