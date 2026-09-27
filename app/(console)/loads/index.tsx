import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";

import { DataTable, FilterTabs, LoadStatusChip, Pager, type Column } from "@/components/console";
import { Banner, Button, Chip, EmptyState, TextField } from "@/components/ui";
import { useConsoleSearch } from "@/features/console/searchStore";
import { LOAD_STATUS_TABS, formatKm, type LoadStatusTab } from "@/features/loads/schemas";
import { useLoads, type LoadListRow } from "@/features/loads/useLoads";
import { SCREENS } from "@/lib/screens";
import { colors, fonts, fontSize, spacing } from "@/theme/tokens";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * C2 Loads (docs/12 C2).
 *
 * The table, the tabs, the dates and the search all resolve in Postgres: the
 * pager asks for one page of twenty and an exact total, and changing a filter
 * returns to page 1 — page 4 of "All loads" is not page 4 of "Unassigned".
 *
 * The status column is derived from the load's latest trip rather than read
 * from a column (ND-20), and the same derivation drives the tabs, so a load
 * cannot appear under one tab and with a different chip.
 */
export default function LoadsScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();

  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<LoadStatusTab>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const search = useConsoleSearch((state) => state.search);

  // A half-typed date is not a filter; the day only counts once it is complete.
  const range = {
    from: DATE_RE.test(from) ? from : "",
    to: DATE_RE.test(to) ? to : "",
  };

  const query = useLoads({ page, tab, search, range });
  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;

  const columns: Column<LoadListRow>[] = [
    {
      key: "loadCode",
      header: t("console.loads.colLoadId"),
      render: (row) => <Chip label={row.loadCode} tone="accent" />,
      width: 150,
    },
    {
      key: "pickup",
      header: t("console.loads.colPickup"),
      sortValue: (row) => row.pickupAddress,
      render: (row) => <Text style={styles.cell}>{row.pickupAddress}</Text>,
    },
    {
      key: "drop",
      header: t("console.loads.colDrop"),
      sortValue: (row) => row.dropAddress,
      render: (row) => <Text style={styles.cell}>{row.dropAddress}</Text>,
    },
    {
      key: "planned",
      header: t("console.loads.colPlannedKm"),
      align: "right",
      render: (row) => <Text style={styles.numeric}>{formatKm(row.plannedDistanceM)}</Text>,
      width: 110,
    },
    {
      key: "material",
      header: t("console.loads.colMaterial"),
      sortValue: (row) => row.material ?? "",
      render: (row) => (
        <Text style={row.material ? styles.cell : styles.muted}>
          {row.material ?? t("console.loads.notSet")}
        </Text>
      ),
      width: 130,
    },
    {
      key: "created",
      header: t("console.loads.colCreated"),
      sortValue: (row) => row.createdAt,
      render: (row) => <Text style={styles.cell}>{formatDate(row.createdAt, i18n.language)}</Text>,
      width: 120,
    },
    {
      key: "status",
      header: t("console.loads.colStatus"),
      render: (row) => (
        <LoadStatusChip
          label={t(`console.loads.${statusKey(row.status)}` as "console.loads.filterDone")}
          status={row.status}
          testID={`load-status-${row.loadCode}`}
        />
      ),
      width: 130,
    },
    {
      key: "driver",
      header: t("console.loads.colDriver"),
      sortValue: (row) => row.driverName ?? "",
      render: (row) => (
        <Text style={row.driverName ? styles.cell : styles.muted}>
          {row.driverName ?? t("console.loads.noDriver")}
        </Text>
      ),
    },
  ];

  return (
    <View style={styles.screen} testID="loads-screen">
      <View style={styles.header}>
        <View>
          <Text style={styles.heading}>{t("console.loads.title")}</Text>
          <Text style={styles.subheading}>{t("console.loads.subtitle")}</Text>
        </View>
        <Button
          icon="add"
          label={t("console.loads.create")}
          onPress={() => router.push(SCREENS.C3.route as never)}
          size="lg"
          testID="loads-create"
        />
      </View>

      <FilterTabs
        onChange={(key) => {
          setTab(key);
          setPage(1);
        }}
        tabs={LOAD_STATUS_TABS.map((key) => ({
          key,
          label: t(`console.loads.filter${labelSuffix(key)}` as "console.loads.filterAll"),
        }))}
        value={tab}
        testID="loads-tabs"
      />

      <View style={styles.dates}>
        <TextField
          label={t("console.loads.dateFrom")}
          onChangeText={(text) => {
            setFrom(text);
            setPage(1);
          }}
          placeholder="YYYY-MM-DD"
          testID="loads-date-from"
          value={from}
        />
        <TextField
          label={t("console.loads.dateTo")}
          onChangeText={(text) => {
            setTo(text);
            setPage(1);
          }}
          placeholder="YYYY-MM-DD"
          testID="loads-date-to"
          value={to}
        />
      </View>

      {query.isError ? <Banner message={t("console.loads.loadFailed")} variant="error" /> : null}

      {query.isSuccess && rows.length === 0 ? (
        <EmptyState
          icon="inventory_2"
          message={t("console.loads.empty")}
          title={t("console.loads.emptyTitle")}
        />
      ) : (
        <DataTable
          columns={columns}
          emptyMessage={t("console.loads.empty")}
          // The rows are already one server page, so the table must not slice
          // them again.
          pageSize={rows.length || 1}
          rowKey={(row) => row.id}
          rows={rows}
          testID="loads-table"
          onRowPress={(row) => router.push(`/(console)/loads/${row.id}` as never)}
        />
      )}

      {total > 0 ? (
        <Pager
          onPageChange={setPage}
          page={page}
          pageCount={query.data?.pageCount ?? 1}
          summary={t("console.loads.rowCount", { count: total })}
          testID="loads-pager"
          total={total}
        />
      ) : null}
    </View>
  );
}

/** `unassigned` → `Unassigned`, `in_trip` → `InTrip`, matching the i18n keys. */
function labelSuffix(status: LoadStatusTab): string {
  if (status === "all") {
    return "All";
  }
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function statusKey(status: LoadListRow["status"]): string {
  return status === "in_trip"
    ? "filterInTrip"
    : `filter${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

function formatDate(iso: string, language: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  try {
    return new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: spacing.md, padding: spacing.lg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heading: { fontFamily: fonts.semibold, fontSize: fontSize.title, color: colors.text },
  subheading: {
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
  dates: { flexDirection: "row", gap: spacing.md, maxWidth: 360 },
  cell: { fontFamily: fonts.regular, fontSize: fontSize.body, color: colors.text },
  muted: { fontFamily: fonts.regular, fontSize: fontSize.body, color: colors.textDisabled },
  numeric: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.body,
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
});
