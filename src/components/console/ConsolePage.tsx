import { MaterialIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { colors, radius, space } from '@/theme/tokens';

/** Content area of a console page: optional search-filter pill, actions row, then content. */
export function ConsolePage({
  actions,
  filter,
  onClearFilter,
  clearLabel,
  children,
}: {
  actions?: ReactNode;
  filter?: string;
  onClearFilter?: () => void;
  clearLabel?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.page}>
      <View style={styles.toolbar}>
        {filter ? (
          <View style={styles.pill}>
            <Text variant="caption">{filter}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={clearLabel}
              onPress={onClearFilter}
              hitSlop={16}
            >
              <MaterialIcons name="close" size={16} color={colors.textSecondary} />
            </Pressable>
          </View>
        ) : null}
        <View style={styles.actions}>{actions}</View>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: space.lg, gap: space.md },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.chip,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actions: { marginLeft: 'auto', flexDirection: 'row', gap: space.sm },
});
