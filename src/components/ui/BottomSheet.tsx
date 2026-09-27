import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, fonts, fontSize, layout, radii, shadows, spacing, zIndex } from "@/theme/tokens";

export type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Tapping the backdrop closes the sheet (default true). */
  dismissOnBackdrop?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Bottom-anchored sheet with a grab handle and an optional title. */
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  dismissOnBackdrop = true,
  style,
  testID,
}: BottomSheetProps) {
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}
      testID={testID}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityLabel="Close"
          accessibilityRole="button"
          disabled={!dismissOnBackdrop}
          onPress={dismissOnBackdrop ? onClose : undefined}
          style={styles.backdrop}
        />
        <View style={[styles.sheet, style]}>
          <View style={styles.handle} />
          {title ? <Text style={styles.title}>{title}</Text> : null}
          <View style={styles.body}>{children}</View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", zIndex: zIndex.sheet },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    width: "100%",
    maxWidth: layout.contentMaxWidth,
    alignSelf: "center",
    ...shadows.sheet,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: radii.chip,
    backgroundColor: colors.borderStrong,
  },
  title: { fontFamily: fonts.semibold, fontSize: fontSize.subtitle, color: colors.text },
  body: { gap: spacing.md },
});
