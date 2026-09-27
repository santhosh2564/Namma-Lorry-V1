import type { StyleProp, ViewStyle } from "react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "@/components/ui/Icon";
import { borderWidth, colors, fonts, fontSize, spacing, touch } from "@/theme/tokens";

export type PagerProps = {
  page: number;
  pageCount: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Localised "47 loads" / "12 trips" line. */
  summary: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Server-side pager (M7).
 *
 * `DataTable` paginates in the browser, which is right for a table that is
 * already fully loaded and wrong for one that is not: C2 and C5 page a single
 * page of twenty out of the whole table, so the footer here asks for a page
 * rather than slicing the rows it was given.
 */
export function Pager({
  page,
  pageCount,
  total,
  onPageChange,
  summary,
  style,
  testID,
}: PagerProps) {
  const atFirst = page <= 1;
  const atLast = page >= pageCount;

  return (
    <View style={[styles.bar, style]} testID={testID}>
      <Text style={styles.summary} testID={testID ? `${testID}-summary` : undefined}>
        {summary}
      </Text>
      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          disabled={atFirst}
          onPress={() => onPageChange(page - 1)}
          style={styles.button}
          testID="pager-prev"
        >
          <Icon
            name="chevron_left"
            size={20}
            color={atFirst ? colors.textDisabled : colors.primary}
          />
        </Pressable>
        <Text style={styles.label} testID="pager-label">
          {page} / {pageCount}
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={atLast}
          onPress={() => onPageChange(page + 1)}
          style={styles.button}
          testID="pager-next"
        >
          <Icon
            name="chevron_right"
            size={20}
            color={atLast ? colors.textDisabled : colors.primary}
          />
        </Pressable>
      </View>
    </View>
  );
}

/** Sensible zero state: one page, no rows, pager hidden by the caller. */
export const PAGER_EMPTY = { page: 1, pageCount: 1, total: 0 } as const;

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border,
  },
  summary: { fontFamily: fonts.regular, fontSize: fontSize.caption, color: colors.textSecondary },
  controls: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  button: {
    minWidth: touch.min - 8,
    minHeight: touch.min - 8,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    fontVariant: ["tabular-nums"],
  },
});
