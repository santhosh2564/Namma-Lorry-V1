import { useMemo, useState } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { Icon } from "@/components/ui/Icon";
import { borderWidth, colors, fonts, fontSize, radii, spacing, touch } from "@/theme/tokens";

export type SearchSelectOption = {
  key: string;
  title: string;
  /** Second line, e.g. "38 verified trips · 4,120 km". */
  subtitle?: string;
  /** Short trailing label, e.g. "19 ft". */
  trailing?: string;
  /** Amber row treatment for something the admin should notice (C4's busy driver). */
  warning?: string;
  disabled?: boolean;
};

export type SearchSelectProps = {
  label: string;
  options: SearchSelectOption[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  searchPlaceholder: string;
  emptyMessage: string;
  /** Fields the search term is matched against. */
  searchIn?: (option: SearchSelectOption) => string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The C4 driver and vehicle pickers.
 *
 * A console select, not a native one: doc 12 needs a *searchable* driver list
 * that shows each driver's verified experience and whether they are on a trip
 * right now, which a `<select>` cannot do. Both pickers share this component so
 * the two lists behave identically.
 *
 * A busy driver is **not** blocked here. The database allows a driver to be
 * assigned while already live — `trips_one_active_per_driver` only guards a
 * second `in_progress` trip, and `start_trip` is where that is refused — so the
 * honest treatment is the warning doc 12 asks for, not a rule the schema does
 * not have.
 */
export function SearchSelect({
  label,
  options,
  selectedKey,
  onSelect,
  searchPlaceholder,
  emptyMessage,
  searchIn,
  disabled = false,
  style,
  testID,
}: SearchSelectProps) {
  const [term, setTerm] = useState("");

  const visible = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (needle === "") {
      return options;
    }
    const haystack =
      searchIn ?? ((option: SearchSelectOption) => `${option.title} ${option.subtitle ?? ""}`);
    return options.filter((option) => haystack(option).toLowerCase().includes(needle));
  }, [options, searchIn, term]);

  const selected = options.find((option) => option.key === selectedKey) ?? null;

  return (
    <View style={styles.group} testID={testID}>
      <Text style={styles.label}>{label}</Text>

      <View style={styles.search}>
        <Icon name="search" size={18} color={colors.textSecondary} />
        <TextInput
          accessibilityLabel={label}
          editable={!disabled}
          onChangeText={setTerm}
          placeholder={searchPlaceholder}
          placeholderTextColor={colors.textDisabled}
          style={styles.searchInput}
          testID={testID ? `${testID}-search` : undefined}
          value={term}
        />
        {term !== "" ? (
          <Pressable
            accessibilityLabel="Clear"
            accessibilityRole="button"
            onPress={() => setTerm("")}
          >
            <Icon name="close" size={18} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {selected !== null ? (
        <Text style={styles.selected} testID={testID ? `${testID}-selected` : undefined}>
          {selected.subtitle ? `${selected.title} · ${selected.subtitle}` : selected.title}
        </Text>
      ) : null}

      <ScrollView style={styles.list} testID={testID ? `${testID}-options` : undefined}>
        {visible.length === 0 ? (
          <Text style={styles.empty}>{emptyMessage}</Text>
        ) : (
          visible.map((option) => {
            const isSelected = option.key === selectedKey;
            return (
              <Pressable
                key={option.key}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected, disabled: option.disabled ?? false }}
                disabled={disabled || option.disabled === true}
                onPress={() => onSelect(option.key)}
                style={({ pressed }) => [
                  styles.option,
                  option.warning !== undefined ? styles.optionWarn : null,
                  isSelected ? styles.optionSelected : null,
                  pressed ? styles.optionPressed : null,
                ]}
                testID={testID ? `${testID}-option-${option.key}` : undefined}
              >
                <View style={styles.optionMain}>
                  <Text style={styles.optionTitle}>{option.title}</Text>
                  {option.subtitle !== undefined ? (
                    <Text style={styles.optionSubtitle}>{option.subtitle}</Text>
                  ) : null}
                  {option.warning !== undefined ? (
                    <View style={styles.warningRow}>
                      <Icon name="warning" size={14} color={colors.review} />
                      <Text style={styles.warningText}>{option.warning}</Text>
                    </View>
                  ) : null}
                </View>
                {option.trailing !== undefined ? (
                  <Text style={styles.trailing}>{option.trailing}</Text>
                ) : null}
                {isSelected ? <Icon name="check" size={18} color={colors.primary} /> : null}
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.xs },
  label: { fontFamily: fonts.medium, fontSize: fontSize.caption, color: colors.textSecondary },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: touch.min,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: fontSize.body,
    color: colors.text,
    paddingVertical: spacing.sm,
  },
  selected: {
    fontFamily: fonts.medium,
    fontSize: fontSize.caption,
    color: colors.primary,
  },
  list: { maxHeight: 220 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: touch.min,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: "transparent",
  },
  optionWarn: { backgroundColor: colors.reviewMuted, borderLeftColor: colors.review },
  optionSelected: { backgroundColor: colors.primaryMuted },
  optionPressed: { backgroundColor: colors.surfaceAlt },
  optionMain: { flex: 1, gap: 2 },
  optionTitle: { fontFamily: fonts.medium, fontSize: fontSize.body, color: colors.text },
  optionSubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
  warningRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  warningText: { fontFamily: fonts.medium, fontSize: fontSize.caption, color: colors.review },
  trailing: {
    fontFamily: fonts.medium,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
  empty: {
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    padding: spacing.md,
  },
});
