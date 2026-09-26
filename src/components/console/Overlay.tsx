import { MaterialIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Modal as RNModal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Text } from '@/components/ui';
import { colors, radius, sizes, space } from '@/theme/tokens';

interface OverlayProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

function Header({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <View style={styles.head}>
      <Text variant="subtitle" accessibilityRole="header" style={styles.flex}>
        {title}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.close}>
        <MaterialIcons name="close" size={22} color={colors.text} />
      </Pressable>
    </View>
  );
}

/** Right-hand side drawer (C8 Add Driver). Full width on narrow screens. */
export function Drawer({ open, title, onClose, children, footer }: OverlayProps) {
  const { width } = useWindowDimensions();
  return (
    <RNModal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrimRow}>
        <Pressable style={styles.flex} accessibilityLabel="Close" onPress={onClose} />
        <View style={[styles.drawer, { width: Math.min(sizes.drawer, width) }]} accessibilityViewIsModal>
          <Header title={title} onClose={onClose} />
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </View>
    </RNModal>
  );
}

/** Centred dialog (C9 Add Vehicle). */
export function Modal({ open, title, onClose, children, footer }: OverlayProps) {
  return (
    <RNModal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrimCenter}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close" onPress={onClose} />
        <View style={styles.dialog} accessibilityViewIsModal>
          <Header title={title} onClose={onClose} />
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrimRow: { flex: 1, flexDirection: 'row', backgroundColor: colors.scrim },
  scrimCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.scrim,
    padding: space.md,
  },
  drawer: { backgroundColor: colors.surface, height: '100%' },
  dialog: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  body: { padding: space.lg, gap: space.lg },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space.sm,
    padding: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
