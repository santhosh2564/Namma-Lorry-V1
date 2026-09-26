import { MaterialIcons } from '@expo/vector-icons';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text, TextField } from '@/components/ui';
import { matchesSearch } from '@/features/console/consoleData';
import { colors, radius, space } from '@/theme/tokens';

export interface SelectOption {
  id: string;
  label: string;
  /** Extra text matched by the search (phone, plate…). */
  keywords?: string;
  render?: ReactNode;
  disabled?: boolean;
}

/** Searchable single-select list (radio semantics). */
export function SearchSelect({
  label,
  placeholder,
  options,
  value,
  onChange,
  error,
  testID,
}: {
  label: string;
  placeholder: string;
  options: SelectOption[];
  value: string | undefined;
  onChange: (id: string) => void;
  error?: string;
  testID?: string;
}) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => options.filter((o) => matchesSearch(q, o.label, o.keywords)), [options, q]);
  return (
    <View style={styles.wrap}>
      <TextField
        testID={testID ? `${testID}-search` : undefined}
        label={label}
        value={q}
        onChangeText={setQ}
        placeholder={placeholder}
        error={error}
      />
      <ScrollView style={styles.list} nestedScrollEnabled role="radiogroup" accessibilityLabel={label}>
        {shown.map((o) => {
          const selected = o.id === value;
          return (
            <Pressable
              key={o.id}
              testID={testID ? `${testID}-option` : undefined}
              accessibilityRole="radio"
              accessibilityLabel={o.label}
              accessibilityState={{ checked: selected, disabled: o.disabled }}
              disabled={o.disabled}
              onPress={() => onChange(o.id)}
              style={[styles.option, selected && styles.selected, o.disabled && styles.disabled]}
            >
              <MaterialIcons
                name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
                size={20}
                color={selected ? colors.primary : colors.textSecondary}
              />
              <View style={styles.flex}>{o.render ?? <Text>{o.label}</Text>}</View>
            </Pressable>
          );
        })}
        {!shown.length ? (
          <Text variant="caption" tone="secondary" style={styles.empty}>
            No matches.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  list: { maxHeight: 260, borderWidth: 1, borderColor: colors.border, borderRadius: radius.input },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    minHeight: 48,
  },
  selected: { backgroundColor: colors.surfaceMuted },
  disabled: { opacity: 0.5 },
  flex: { flex: 1 },
  empty: { padding: space.md },
});
