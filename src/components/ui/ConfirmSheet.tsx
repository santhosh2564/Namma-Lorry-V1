import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { colors, fonts, fontSize, spacing } from "@/theme/tokens";

export type ConfirmSheetProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Destructive confirm renders a red button (e.g. End trip). */
  destructive?: boolean;
  /**
   * Extra content between the message and the buttons — D5 uses it for the
   * "you are outside the delivery area" warning, which must not stop the
   * driver from ending (docs/08 §3: end is never blocked).
   */
  children?: ReactNode;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  testID?: string;
};

/** Confirmation dialog on a bottom sheet — used for "End this trip?". */
export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  children,
  loading = false,
  onConfirm,
  onCancel,
  testID,
}: ConfirmSheetProps) {
  return (
    <BottomSheet onClose={onCancel} title={title} visible={visible} testID={testID}>
      <Text style={styles.message}>{message}</Text>
      {children}
      <View style={styles.actions}>
        <Button
          fullWidth
          label={confirmLabel}
          loading={loading}
          onPress={onConfirm}
          variant={destructive ? "danger" : "primary"}
        />
        <Button fullWidth label={cancelLabel} onPress={onCancel} variant="outline" />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  message: { fontFamily: fonts.regular, fontSize: fontSize.body, color: colors.textSecondary },
  actions: { gap: spacing.sm },
});
