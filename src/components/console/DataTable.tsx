import { MaterialIcons } from '@expo/vector-icons';
import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { colors, radius, shadow, space } from '@/theme/tokens';

import { isHovered } from './hover';
import { paginate, sortRows, type SortDir, type SortValue } from './table';

export interface Column<T> {
  key: string;
  header: string;
  /** flex weight of the column (default 1). */
  flex?: number;
  align?: 'left' | 'right';
  render: (row: T) => ReactNode;
  /** Makes the column sortable. */
  sortValue?: (row: T) => SortValue;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyText: string;
  initialSort?: { key: string; dir: SortDir };
  pageSize?: number;
  /** Minimum table width before it scrolls horizontally (narrow windows). */
  minWidth?: number;
  /** Server-side sorting: the table shows `sort` and reports header clicks; rows are not re-sorted. */
  sort?: { key: string; dir: SortDir };
  onSortChange?: (s: { key: string; dir: SortDir }) => void;
  /** Server-side paging: `rows` is already the current page. */
  serverPage?: { page: number; total: number; onPageChange: (page: number) => void };
  onRowPress?: (row: T) => void;
  rowAccessibilityLabel?: (row: T) => string;
}

/** Sortable table with a sticky header and client-side pagination (console, web-first). */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  emptyText,
  initialSort,
  pageSize = 20,
  minWidth = 760,
  sort: controlledSort,
  onSortChange,
  serverPage,
  onRowPress,
  rowAccessibilityLabel,
}: DataTableProps<T>) {
  const [localSort, setLocalSort] = useState(initialSort);
  // Explicit width: inside a horizontal ScrollView, flex columns would otherwise size to their longest text.
  const [cardWidth, setCardWidth] = useState(0);
  const [localPage, setLocalPage] = useState(0);
  const sort = onSortChange ? controlledSort : localSort;

  const sorted = useMemo(() => {
    if (onSortChange) return rows ?? [];
    const col = columns.find((c) => c.key === localSort?.key);
    return rows && col?.sortValue && localSort ? sortRows(rows, col.sortValue, localSort.dir) : (rows ?? []);
  }, [rows, columns, localSort, onSortChange]);

  const view = serverPage
    ? (() => {
        const pageCount = Math.max(1, Math.ceil(serverPage.total / pageSize));
        const from = serverPage.total ? serverPage.page * pageSize + 1 : 0;
        return {
          rows: sorted,
          page: serverPage.page,
          pageCount,
          from,
          to: from ? from + sorted.length - 1 : 0,
          total: serverPage.total,
        };
      })()
    : paginate(sorted, localPage, pageSize);
  const setPage = serverPage ? serverPage.onPageChange : setLocalPage;

  function toggle(key: string) {
    const next: { key: string; dir: SortDir } =
      sort?.key === key ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' };
    if (onSortChange) onSortChange(next);
    else {
      setLocalPage(0);
      setLocalSort(next);
    }
  }

  const header = (
    <View style={[styles.row, styles.header]} accessibilityRole="header">
      {columns.map((c) => {
        const active = sort?.key === c.key;
        const content = (
          <View style={[styles.headCell, c.align === 'right' && styles.headRight]}>
            <Text variant="caption" tone="secondary" style={styles.headText}>
              {c.header.toUpperCase()}
            </Text>
            {c.sortValue ? (
              <MaterialIcons
                name={active ? (sort!.dir === 'asc' ? 'arrow-upward' : 'arrow-downward') : 'unfold-more'}
                size={14}
                color={active ? colors.primary : colors.disabled}
              />
            ) : null}
          </View>
        );
        return (
          <View key={c.key} style={[styles.cell, { flex: c.flex ?? 1 }]}>
            {c.sortValue ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Sort by ${c.header}`}
                accessibilityState={{ selected: active }}
                onPress={() => toggle(c.key)}
              >
                {content}
              </Pressable>
            ) : (
              content
            )}
          </View>
        );
      })}
    </View>
  );

  let body: ReactNode;
  if (loading) {
    body = (
      <View style={styles.state}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  } else if (error) {
    body = (
      <View style={styles.state}>
        <Text tone="danger">{error}</Text>
        {onRetry ? <Button label="Try again" variant="text" icon="refresh" onPress={onRetry} /> : null}
      </View>
    );
  } else if (view.total === 0) {
    body = (
      <View style={styles.state}>
        <Text tone="secondary">{emptyText}</Text>
      </View>
    );
  } else {
    body = view.rows.map((row) => {
      const cells = columns.map((c) => (
        <View key={c.key} style={[styles.cell, { flex: c.flex ?? 1 }, c.align === 'right' && styles.right]}>
          {c.render(row)}
        </View>
      ));
      return onRowPress ? (
        <Pressable
          key={rowKey(row)}
          accessibilityRole="link"
          accessibilityLabel={rowAccessibilityLabel?.(row)}
          onPress={() => onRowPress(row)}
          style={(state) => [styles.row, styles.bodyRow, isHovered(state) && styles.rowHover]}
        >
          {cells}
        </Pressable>
      ) : (
        <View key={rowKey(row)} style={[styles.row, styles.bodyRow]}>
          {cells}
        </View>
      );
    });
  }

  return (
    <View style={styles.card} onLayout={(e) => setCardWidth(e.nativeEvent.layout.width)}>
      <ScrollView horizontal contentContainerStyle={styles.hscroll}>
        <View style={{ width: Math.max(minWidth, cardWidth) }}>
          <ScrollView stickyHeaderIndices={[0]} style={styles.vscroll}>
            {header}
            <View>{body}</View>
          </ScrollView>
        </View>
      </ScrollView>
      {view.total > pageSize || (serverPage && view.page > 0) ? (
        <View style={styles.footer}>
          <Text variant="caption" tone="secondary">
            {view.from}–{view.to} of {view.total}
          </Text>
          <View style={styles.pager}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous page"
              disabled={view.page === 0}
              onPress={() => setPage(view.page - 1)}
              style={styles.pageBtn}
            >
              <MaterialIcons
                name="chevron-left"
                size={22}
                color={view.page === 0 ? colors.disabled : colors.primary}
              />
            </Pressable>
            <Text variant="caption">
              Page {view.page + 1} of {view.pageCount}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next page"
              disabled={view.page >= view.pageCount - 1}
              onPress={() => setPage(view.page + 1)}
              style={styles.pageBtn}
            >
              <MaterialIcons
                name="chevron-right"
                size={22}
                color={view.page >= view.pageCount - 1 ? colors.disabled : colors.primary}
              />
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    overflow: 'hidden',
    flexShrink: 1,
    ...shadow.card,
  },
  hscroll: { flexGrow: 1 },
  vscroll: { maxHeight: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md },
  header: { backgroundColor: colors.surfaceMuted, minHeight: 44 },
  headCell: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44 },
  headText: { letterSpacing: 0.5 },
  bodyRow: { minHeight: 56, borderTopWidth: 1, borderTopColor: colors.border },
  rowHover: { backgroundColor: colors.surfaceMuted },
  cell: { paddingHorizontal: space.sm, justifyContent: 'center', minWidth: 0 },
  right: { alignItems: 'flex-end' },
  headRight: { justifyContent: 'flex-end' },
  state: { padding: space.xl, alignItems: 'center', gap: space.sm },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    minHeight: 48,
  },
  pager: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pageBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
