import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, sizes, space } from '@/theme/tokens';

import { Text } from './Text';

export interface ChoiceChipsProps<T extends string> {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T | undefined;
  onChange: (v: T) => void;
  error?: string;
}

/** Single-select radio group rendered as chips (works the same on web and native). */
export function ChoiceChips<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
}: ChoiceChipsProps<T>) {
  return (
    <View style={styles.wrap}>
      <Text variant="bodyStrong" nativeID={`${label}-label`}>
        {label}
      </Text>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabelledBy={`${label}-label`}>
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(o.value)}
              hitSlop={4}
              style={[styles.chip, selected && styles.selected]}
            >
              {selected ? <MaterialIcons name="check" size={16} color={colors.onPrimary} /> : null}
              <Text variant="bodyStrong" style={{ color: selected ? colors.onPrimary : colors.text }}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <Text variant="caption" tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: sizes.touchMin - 8,
    paddingHorizontal: space.md,
    borderRadius: radius.chip,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
});
