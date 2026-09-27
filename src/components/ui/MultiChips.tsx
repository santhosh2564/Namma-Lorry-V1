import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, sizes, space } from '@/theme/tokens';

import { Text } from './Text';

/** Compact filter chips. `multi` toggles membership; otherwise one value is selected. */
export function FilterChips<T extends string>({
  label,
  options,
  selected,
  onToggle,
  multi = false,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  selected: readonly T[];
  onToggle: (v: T) => void;
  multi?: boolean;
}) {
  return (
    <View style={styles.row} accessibilityLabel={label} role={multi ? 'group' : 'radiogroup'}>
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <Pressable
            key={o.value}
            accessibilityRole={multi ? 'checkbox' : 'radio'}
            accessibilityState={multi ? { checked: on } : { selected: on, checked: on }}
            onPress={() => onToggle(o.value)}
            hitSlop={6}
            style={[styles.chip, on && styles.on]}
          >
            {on && multi ? <MaterialIcons name="check" size={14} color={colors.onPrimary} /> : null}
            <Text variant="caption" style={[styles.text, { color: on ? colors.onPrimary : colors.text }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: sizes.touchMin - 12,
    paddingHorizontal: space.md,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  on: { backgroundColor: colors.primary, borderColor: colors.primary },
  text: { fontSize: 14 },
});
