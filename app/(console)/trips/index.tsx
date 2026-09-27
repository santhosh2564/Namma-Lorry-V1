import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { DataTable, Pager, type Column } from "@/components/console";
import { Banner, Chip, EmptyState, StatusChip, TextField } from "@/components/ui";
import { useConsoleSearch } from "@/features/console/searchStore";
import { useDrivers } from "@/features/drivers/useDrivers";
import { useTrips, type TripListRow } from "@/features/trips/useTrips";
import { useVehicles } from "@/features/vehicles/useVehicles";
import { TRIP_STATUS, type TripStatus } from "@/theme/status";
import { borderWidth, colors, fonts, fontSize, radii, spacing, touch } from "@/theme/tokens";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** doc 12 puts the reconciliation statuses first; cancelled is noise on a board. */
const STATUS_FILTERS = [
  "in_progress",
  "needs_review",
  "verified",
  "completed",
  "rejected",
  "assigned",
  "cancelled",
] as const;

/**
 * C5 Trips (docs/12 C5).
 *
 * Paging, the status multi-select, the driver and vehicle filters and the date
 * range are all resolved in Postgres. Search matches the Load ID, which lives
 * on `loads`, so the term is turned into load ids first and the trip query
 * filters on those — filtering after paging would show a page of ten rows of
 * which one matched.
 *
 * "Verified km" is `trips.tracked_distance_m`, which only `verify_trip` writes.
 * The console displays it and never computes it (CLAUDE.md rule 1), so a trip
 * that has not been verified yet shows a dash rather than the planned distance
 * standing in for it.
 *
 * CSV export is omitted: ND-19 rates it P1, and it is the one part of doc 12
 * C5 with no supporting column or rule.
 */
export default function TripsScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();

  const [page, setPage] = useState(1);
  const [statuses, setStatuses] = useState<TripStatus[]>([]);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const search = useConsoleSearch((state) => state.search);
  const driversQuery = useDrivers();
  const vehiclesQuery = useVehicles();

  const query = useTrips({
    page,
    statuses,
    driverId,
    vehicleId,
    search,
    range: {
      from: DATE_RE.test(from) ? from : "",
      to: DATE_RE.test(to) ? to : "",
    },
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;

  const toggleStatus = (status: TripStatus) => {
    setStatuses((current) =>
      current.includes(status) ? current.filter((value) => value !== status) : [...current, status],
    );
    setPage(1);
  };

  const columns: Column<TripListRow>[] = [
    {
      key: "loadCode",
      header: t("console.trips.colLoad"),
      render: (row) => <Chip label={row.loadCode} tone="accent" />,
      width: 150,
    },
    {
      key: "driver",
      header: t("console.trips.colDriver"),
      sortValue: (row) => row.driverName,
      render: (row) => <Text style={styles.cell}>{row.driverName}</Text>,
    },
    {
      key: "vehicle",
      header: t("console.trips.colVehicle"),
      sortValue: (row) => row.vehicleNo,
      render: (row) => <Text style={styles.plate}>{row.vehicleNo}</Text>,
      width: 150,
    },
    {
      key: "started",
      header: t("console.trips.colStarted"),
      sortValue: (row) => row.startedAt ?? "",
      render: (row) => (
        <Text style={styles.cell}>
          {row.startedAt === null
            ? t("console.trips.notStarted")
            : formatDateTime(row.startedAt, i18n.language)}
        </Text>
      ),
      width: 150,
    },
    {
      key: "ended",
      header: t("console.trips.colEnded"),
      sortValue: (row) => row.endedAt ?? "",
      render: (row) => (
        <Text style={styles.cell}>
          {row.endedAt === null
            ? t("console.trips.notEnded")
            : formatDateTime(row.endedAt, i18n.language)}
        </Text>
      ),
      width: 150,
    },
    {
      key: "duration",
      header: t("console.trips.colDuration"),
      sortValue: (row) => durationMinutes(row) ?? -1,
      render: (row) => <Text style={styles.cell}>{formatDuration(row)}</Text>,
      width: 110,
    },
    {
      key: "verifiedKm",
      header: t("console.trips.colVerifiedKm"),
      align: "right",
      sortValue: (row) => row.trackedDistanceKm ?? -1,
      render: (row) => (
        <Text style={styles.numeric}>
          {row.trackedDistanceKm === null
            ? t("console.loads.notSet")
            : `${row.trackedDistanceKm} km`}
        </Text>
      ),
      width: 120,
    },
    {
      key: "status",
      header: t("console.trips.colStatus"),
      render: (row) => <StatusChip audience="console" status={row.status} />,
      width: 140,
    },
    {
      key: "reasons",
      header: t("console.trips.colReasons"),
      render: (row) => (
        <Text style={row.reasons.length > 0 ? styles.warnText : styles.muted}>
          {row.reasons.length === 0
            ? t("console.trips.noReasons")
            : t("console.trips.reasons", { count: row.reasons.length })}
        </Text>
      ),
      width: 110,
    },
  ];

  return (
    <View style={styles.screen} testID="trips-screen">
      <View style={styles.header}>
        <View>
          <Text style={styles.heading}>{t("console.trips.title")}</Text>
          <Text style={styles.subheading}>{t("console.trips.subtitle")}</Text>
        </View>
      </View>

      <View style={styles.filters}>
        <View style={styles.statusFilters}>
          <Text style={styles.filterLabel}>{t("console.trips.allStatuses")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.statusRow}>
              {STATUS_FILTERS.map((status) => {
                const selected = statuses.includes(status);
                return (
                  <Pressable
                    key={status}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => toggleStatus(status)}
                    style={[styles.statusTab, selected ? styles.statusTabSelected : null]}
                    testID={`trips-status-${status}`}
                  >
                    <Text style={[styles.statusText, selected ? styles.statusTextSelected : null]}>
                      {TRIP_STATUS[status].consoleLabel}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>

        <View style={styles.selects}>
          <ChoiceSelect
            allLabel={t("console.trips.allDrivers")}
            label={t("console.trips.allDrivers")}
            onChange={setDriverId}
            options={(driversQuery.data ?? []).map((driver) => ({
              key: driver.id,
              label: driver.fullName,
            }))}
            testID="trips-driver"
            value={driverId}
          />
          <ChoiceSelect
            allLabel={t("console.trips.allVehicles")}
            label={t("console.trips.allVehicles")}
            onChange={setVehicleId}
            options={(vehiclesQuery.data ?? []).map((vehicle) => ({
              key: vehicle.id,
              label: vehicle.registrationNo,
            }))}
            testID="trips-vehicle"
            value={vehicleId}
          />
          <TextField
            label={t("console.loads.dateFrom")}
            onChangeText={(text) => {
              setFrom(text);
              setPage(1);
            }}
            placeholder="YYYY-MM-DD"
            testID="trips-date-from"
            value={from}
          />
          <TextField
            label={t("console.loads.dateTo")}
            onChangeText={(text) => {
              setTo(text);
              setPage(1);
            }}
            placeholder="YYYY-MM-DD"
            testID="trips-date-to"
            value={to}
          />
        </View>
      </View>

      {query.isError ? <Banner message={t("console.trips.loadFailed")} variant="error" /> : null}

      {query.isSuccess && rows.length === 0 ? (
        <EmptyState
          icon="local_shipping"
          message={t("console.trips.empty")}
          title={t("console.trips.emptyTitle")}
        />
      ) : (
        <DataTable
          columns={columns}
          emptyMessage={t("console.trips.empty")}
          pageSize={rows.length || 1}
          rowKey={(row) => row.id}
          rows={rows}
          testID="trips-table"
          onRowPress={(row) => router.push(`/(console)/trips/${row.id}` as never)}
        />
      )}

      {total > 0 ? (
        <Pager
          onPageChange={setPage}
          page={page}
          pageCount={query.data?.pageCount ?? 1}
          summary={t("console.trips.rowCount", { count: total })}
          testID="trips-pager"
          total={total}
        />
      ) : null}
    </View>
  );
}

/** A single-choice filter. Plain Text + a horizontal list, as on a console. */
function ChoiceSelect({
  label,
  allLabel,
  options,
  value,
  onChange,
  testID,
}: {
  label: string;
  /** Wording for the "no filter" option, e.g. "All drivers". */
  allLabel: string;
  options: { key: string; label: string }[];
  value: string | null;
  onChange: (key: string | null) => void;
  testID: string;
}) {
  return (
    <View style={styles.choice}>
      <Text style={styles.filterLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.statusRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: value === null }}
            onPress={() => onChange(null)}
            style={[styles.statusTab, value === null ? styles.statusTabSelected : null]}
            testID={`${testID}-all`}
          >
            <Text style={[styles.statusText, value === null ? styles.statusTextSelected : null]}>
              {allLabel}
            </Text>
          </Pressable>
          {options.map((option) => {
            const selected = option.key === value;
            return (
              <Pressable
                key={option.key}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onChange(option.key)}
                style={[styles.statusTab, selected ? styles.statusTabSelected : null]}
                testID={`${testID}-${option.key}`}
              >
                <Text style={[styles.statusText, selected ? styles.statusTextSelected : null]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

function durationMinutes(row: TripListRow): number | null {
  if (row.startedAt === null || row.endedAt === null) {
    return null;
  }
  const started = new Date(row.startedAt).getTime();
  const ended = new Date(row.endedAt).getTime();
  if (Number.isNaN(started) || Number.isNaN(ended) || ended < started) {
    return null;
  }
  return Math.round((ended - started) / 60_000);
}

function formatDuration(row: TripListRow): string {
  const minutes = durationMinutes(row);
  if (minutes === null) {
    return "—";
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) {
    return `${rest}m`;
  }
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

function formatDateTime(iso: string, language: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  try {
    return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(
      date,
    );
  } catch {
    return date.toISOString().slice(0, 16).replace("T", " ");
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
  filters: { gap: spacing.sm },
  statusFilters: { gap: spacing.xs },
  filterLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
  statusRow: { flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.xs },
  statusTab: {
    minHeight: touch.min - 8,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.chip,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  statusTabSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  statusText: { fontFamily: fonts.medium, fontSize: fontSize.caption, color: colors.text },
  statusTextSelected: { color: colors.onPrimary },
  selects: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, alignItems: "flex-end" },
  choice: { gap: spacing.xs, minWidth: 200 },
  cell: { fontFamily: fonts.regular, fontSize: fontSize.body, color: colors.text },
  plate: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.body,
    color: colors.text,
    letterSpacing: 0.3,
  },
  numeric: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.body,
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  muted: { fontFamily: fonts.regular, fontSize: fontSize.body, color: colors.textDisabled },
  warnText: { fontFamily: fonts.medium, fontSize: fontSize.body, color: colors.review },
});
