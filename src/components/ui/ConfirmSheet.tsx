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
  loading = false,
  onConfirm,
  onCancel,
  testID,
}: ConfirmSheetProps) {
  return (
    <BottomSheet onClose={onCancel} title={title} visible={visible} testID={testID}>
      <Text style={styles.message}>{message}</Text>
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
