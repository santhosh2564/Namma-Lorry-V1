import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Icon } from "@/components/ui/Icon";
import { borderWidth, colors, fonts, fontSize, radii, spacing, touch } from "@/theme/tokens";

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortable?: boolean;
  /** Value used when sorting; defaults to the rendered string. */
  sortValue?: (row: T) => string | number;
  width?: number;
  align?: "left" | "center" | "right";
};

export type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  initialSortKey?: string;
  initialSortAsc?: boolean;
  pageSize?: number;
  emptyMessage?: string;
  onRowPress?: (row: T) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

type SortState = { key: string; asc: boolean };

/**
 * Data-dense console table: clickable sortable headers, a sticky header row and
 * simple client-side pagination. Server-side paging arrives with the console
 * screens (M6/M11); this is the shared presentation shell.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  initialSortKey,
  initialSortAsc = true,
  pageSize = 10,
  emptyMessage = "Nothing here yet",
  onRowPress,
  style,
  testID,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState | null>(
    initialSortKey ? { key: initialSortKey, asc: initialSortAsc } : null,
  );
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.key === sort.key);
    if (!column) return rows;
    const valueOf = column.sortValue ?? ((row: T) => String(column.render(row)));
    return [...rows].sort((a, b) => {
      const av = valueOf(a);
      const bv = valueOf(b);
      if (av < bv) return sort.asc ? -1 : 1;
      if (av > bv) return sort.asc ? 1 : -1;
      return 0;
    });
  }, [columns, rows, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const toggleSort = (key: string) => {
    setPage(0);
    setSort((prev) => (prev?.key === key ? { key, asc: !prev.asc } : { key, asc: true }));
  };

  return (
    <View style={[styles.wrapper, style]} testID={testID}>
      <ScrollView stickyHeaderIndices={[0]}>
        <View style={styles.headerRow}>
          {columns.map((column) => {
            const active = sort?.key === column.key;
            return (
              <Pressable
                key={column.key}
                accessibilityRole={column.sortable ? "button" : undefined}
                disabled={!column.sortable}
                onPress={() => toggleSort(column.key)}
                style={[
                  styles.cell,
                  { width: column.width, flex: column.width ? undefined : 1 },
                  alignStyle(column.align),
                ]}
              >
                <Text style={styles.headerText}>{column.header}</Text>
                {column.sortable ? (
                  <Icon
                    name={active ? (sort?.asc ? "arrow_upward" : "arrow_downward") : "unfold_more"}
                    size={14}
                    color={active ? colors.primary : colors.textDisabled}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {pageRows.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{emptyMessage}</Text>
          </View>
        ) : (
          pageRows.map((row) => (
            <Pressable
              key={rowKey(row)}
              accessibilityRole={onRowPress ? "button" : undefined}
              disabled={!onRowPress}
              onPress={() => onRowPress?.(row)}
              style={({ pressed }) => [
                styles.row,
                pressed && onRowPress ? styles.rowPressed : null,
              ]}
            >
              {columns.map((column) => (
                <View
                  key={column.key}
                  style={[
                    styles.cell,
                    { width: column.width, flex: column.width ? undefined : 1 },
                    alignStyle(column.align),
                  ]}
                >
                  {typeof column.render(row) === "string" ? (
                    <Text style={styles.cellText}>{column.render(row)}</Text>
                  ) : (
                    column.render(row)
                  )}
                </View>
              ))}
            </Pressable>
          ))
        )}
      </ScrollView>

      {pageCount > 1 ? (
        <View style={styles.pager}>
          <Pressable
            accessibilityLabel="Previous page"
            accessibilityRole="button"
            disabled={safePage === 0}
            onPress={() => setPage(safePage - 1)}
            style={styles.pageButton}
          >
            <Icon
              name="chevron_left"
              size={20}
              color={safePage === 0 ? colors.textDisabled : colors.primary}
            />
          </Pressable>
          <Text style={styles.pageLabel}>
            Page {safePage + 1} of {pageCount}
          </Text>
          <Pressable
            accessibilityLabel="Next page"
            accessibilityRole="button"
            disabled={safePage >= pageCount - 1}
            onPress={() => setPage(safePage + 1)}
            style={styles.pageButton}
          >
            <Icon
              name="chevron_right"
              size={20}
              color={safePage >= pageCount - 1 ? colors.textDisabled : colors.primary}
            />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function alignStyle(align: Column<unknown>["align"]) {
  if (align === "center") return { justifyContent: "center" as const };
  if (align === "right") return { justifyContent: "flex-end" as const };
  return { justifyContent: "flex-start" as const };
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  headerRow: {
    flexDirection: "row",
    backgroundColor: colors.surfaceAlt,
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.border,
  },
  cell: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: touch.min,
    paddingHorizontal: spacing.md,
  },
  headerText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.border,
  },
  rowPressed: { backgroundColor: colors.surfaceAlt },
  cellText: { fontFamily: fonts.regular, fontSize: fontSize.body, color: colors.text },
  empty: { alignItems: "center", padding: spacing.xl },
  emptyText: { fontFamily: fonts.regular, fontSize: fontSize.body, color: colors.textSecondary },
  pager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.border,
  },
  pageButton: { padding: spacing.xs },
  pageLabel: { fontFamily: fonts.medium, fontSize: fontSize.caption, color: colors.textSecondary },
});
