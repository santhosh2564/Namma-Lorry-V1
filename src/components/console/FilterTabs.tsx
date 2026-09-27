import type { StyleProp, ViewStyle } from "react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { borderWidth, colors, fonts, fontSize, radii, spacing, touch } from "@/theme/tokens";

export type FilterTab<T extends string> = {
  key: T;
  label: string;
  /** Optional trailing count, e.g. the review badge. */
  count?: number;
};

export type FilterTabsProps<T extends string> = {
  tabs: FilterTab<T>[];
  value: T;
  onChange: (key: T) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The C2 status filter (doc 12: "status tabs (All, Unassigned, Assigned, In
 * trip, Done)").
 *
 * Tabs are a filter, not navigation, so they never change the route — and the
 * console re-queries page 1 when one is picked, because page 4 of the previous
 * tab is rarely page 4 of the new one.
 */
export function FilterTabs<T extends string>({
  tabs,
  value,
  onChange,
  style,
  testID,
}: FilterTabsProps<T>) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={style} testID={testID}>
      <View style={styles.row}>
        {tabs.map((tab) => {
          const selected = tab.key === value;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onChange(tab.key)}
              style={[styles.tab, selected ? styles.tabSelected : null]}
              testID={testID ? `${testID}-${tab.key}` : undefined}
            >
              <Text style={[styles.label, selected ? styles.labelSelected : null]}>
                {tab.label}
              </Text>
              {tab.count !== undefined ? (
                <View style={[styles.count, selected ? styles.countSelected : null]}>
                  <Text style={[styles.countText, selected ? styles.countTextSelected : null]}>
                    {tab.count}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.xs },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: touch.min - 8,
    paddingHorizontal: spacing.md,
    borderRadius: radii.chip,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tabSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  label: { fontFamily: fonts.medium, fontSize: fontSize.caption, color: colors.text },
  labelSelected: { color: colors.onPrimary },
  count: {
    minWidth: 20,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    alignItems: "center",
    borderRadius: radii.chip,
    backgroundColor: colors.surfaceAlt,
  },
  countSelected: { backgroundColor: colors.primaryPressed },
  countText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.textSecondary },
  countTextSelected: { color: colors.onPrimary },
});
