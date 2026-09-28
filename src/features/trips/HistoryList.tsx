/**
 * D7 trip history list (M11, docs/12 D7).
 *
 * "Horizontal filter chips: All, Verified, Under review, Not verified · Summary
 * strip: 38 verified · 2 under review · list of rows grouped by month header
 * 'September 2026', each row showing date, route, Load ID, distance and a status
 * chip."
 *
 * The month grouping and the filter are `historyState`'s job (pure, tested
 * there); this component only draws what they produce and hands a row tap back
 * to the screen, which routes to D6.
 */
import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Card, EmptyState, ListRow, StatusChip } from "@/components/ui";
import {
  groupByMonth,
  historySummary,
  type HistoryFilter,
  type HistoryRow,
} from "@/features/trips/historyState";
import { formatTripDate } from "@/features/trips/summaryState";
import { colors, fonts, fontSize, radii, spacing } from "@/theme/tokens";

export type HistoryListProps = {
  rows: HistoryRow[];
  filter: HistoryFilter;
  onOpen: (tripId: string) => void;
};

export function HistoryList({ rows, filter, onOpen }: HistoryListProps) {
  const { t } = useTranslation();
  const months = groupByMonth(rows, filter);
  const summary = historySummary(rows);

  return (
    <View style={styles.container} testID="history-list">
      <Card style={styles.summary} testID="history-summary">
        <Text style={styles.summaryText} testID="history-summary-text">
          {t("driver.history.summary", {
            verified: summary.verified,
            needsReview: summary.needsReview,
          })}
        </Text>
      </Card>

      {months.length === 0 ? (
        <EmptyState
          icon="route"
          message={t("driver.history.emptyMessage")}
          testID="history-empty"
          title={t("driver.history.emptyTitle")}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} testID="history-scroll">
          {months.map((month) => (
            <View key={month.key} style={styles.month} testID={`history-month-${month.key}`}>
              <Text style={styles.monthLabel}>{month.label}</Text>
              <Card padded={false}>
                {month.rows.map((row, index) => (
                  <View key={row.id} style={index > 0 ? styles.rowBorder : null}>
                    <ListRow
                      icon="route"
                      onPress={() => onOpen(row.id)}
                      right={
                        <View style={styles.rowRight}>
                          <Text style={styles.distance}>
                            {row.trackedDistanceKm === null
                              ? t("driver.history.distancePending")
                              : t("driver.history.distance", { km: row.trackedDistanceKm })}
                          </Text>
                          <StatusChip audience="driver" status={row.status} />
                        </View>
                      }
                      subtitle={`${row.pickupAddress} → ${row.dropAddress}`}
                      testID={`history-row-${row.id}`}
                      title={`${formatTripDate(row.endedAt ?? row.startedAt) ?? "—"} · ${row.loadCode}`}
                    />
                  </View>
                ))}
              </Card>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

/** The filter chips above the list (docs/12 D7). */
export function HistoryFilters({
  filter,
  onChange,
}: {
  filter: HistoryFilter;
  onChange: (next: HistoryFilter) => void;
}) {
  const { t } = useTranslation();
  const options: { key: HistoryFilter; labelKey: string }[] = [
    { key: "all", labelKey: "driver.history.filterAll" },
    { key: "verified", labelKey: "driver.history.filterVerified" },
    { key: "needs_review", labelKey: "driver.history.filterReview" },
    { key: "rejected", labelKey: "driver.history.filterRejected" },
  ];

  return (
    <View style={styles.filters} testID="history-filters">
      {options.map((option) => {
        const selected = option.key === filter;
        return (
          <Card
            key={option.key}
            onPress={() => onChange(option.key)}
            padded={false}
            style={[styles.filter, selected ? styles.filterSelected : null]}
            testID={`history-filter-${option.key}`}
          >
            <Text style={[styles.filterLabel, selected ? styles.filterLabelSelected : null]}>
              {t(option.labelKey)}
            </Text>
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: spacing.sm },
  summary: { paddingVertical: spacing.sm },
  summaryText: { fontFamily: fonts.medium, fontSize: fontSize.body, color: colors.text },
  scroll: { gap: spacing.md, paddingBottom: spacing.lg },
  month: { gap: spacing.xs },
  monthLabel: { fontFamily: fonts.semibold, fontSize: fontSize.subtitle, color: colors.text },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  rowRight: { alignItems: "flex-end", gap: spacing.xs },
  distance: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.body,
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  filter: { borderRadius: radii.chip, paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
  filterSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterLabel: { fontFamily: fonts.medium, fontSize: fontSize.caption, color: colors.text },
  filterLabelSelected: { color: colors.onPrimary },
});
