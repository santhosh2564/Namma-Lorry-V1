import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { LoadStatusChip, SearchSelect, type SearchSelectOption } from "@/components/console";
import { AppMap } from "@/components/map";
import { Banner, Button, Card, Chip, SectionHeader, StatBlock, StatusChip } from "@/components/ui";
import { assignTripSchema, formatKm } from "@/features/loads/schemas";
import { useLoadDetail } from "@/features/loads/useLoads";
import { useAssignableDrivers, useAssignTrip } from "@/features/trips/useTrips";
import { useVehicles } from "@/features/vehicles/useVehicles";
import { borderWidth, colors, fonts, fontSize, radii, spacing } from "@/theme/tokens";

/**
 * C4 Load Detail & Assign (docs/12 C4, doc 04 §4 C4).
 *
 * Assignment is a plain insert into `trips` under the `trips_admin` policy,
 * not an RPC: assigning is not a verification decision, and docs/06 keeps the
 * RPCs for the transitions `verify_trip` and `admin_review_trip` own. The two
 * unique indexes are the real guard, and the console reports them as
 * sentences rather than stack traces.
 *
 * The "planned route" on the map is a straight line between the two geofence
 * centres, and is labelled as such. The Mappls `trucking` distance matrix
 * returns a distance and a duration, not geometry, so a road polyline would
 * have to be invented — which is exactly the kind of thing that must not look
 * authoritative on a dispatch screen. The real number is on the card: the
 * planned distance the proxy returned when the load was created.
 */
export default function LoadDetailScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<{ id: string }>();
  const loadId = typeof params.id === "string" ? params.id : null;

  const [driverId, setDriverId] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  const loadQuery = useLoadDetail(loadId);
  const driversQuery = useAssignableDrivers();
  const vehiclesQuery = useVehicles();
  const assignTrip = useAssignTrip();

  const load = loadQuery.data ?? null;
  // Memoised so the option lists below do not rebuild on every render.
  const drivers = useMemo(() => driversQuery.data ?? [], [driversQuery.data]);
  const vehicles = useMemo(() => vehiclesQuery.data ?? [], [vehiclesQuery.data]);

  const driverOptions: SearchSelectOption[] = useMemo(
    () =>
      drivers.map((driver) => ({
        key: driver.id,
        title: driver.fullName,
        subtitle:
          driver.verifiedTrips === 0
            ? t("console.loads.detail.noTripsYet")
            : t("console.loads.detail.driverStats", {
                trips: driver.verifiedTrips,
                km: driver.verifiedKm,
              }),
        trailing: driver.isBusy
          ? t("console.loads.detail.busy")
          : t("console.loads.detail.available"),
        // doc 12: a busy driver gets a warning row, not a disabled one.
        warning: driver.isBusy ? t("console.loads.detail.busy") : undefined,
      })),
    [drivers, t],
  );

  const vehicleOptions: SearchSelectOption[] = useMemo(
    () =>
      vehicles.map((vehicle) => ({
        key: vehicle.id,
        title: vehicle.registrationNo,
        trailing: vehicle.vehicleType,
      })),
    [vehicles],
  );

  const selectedDriver = drivers.find((driver) => driver.id === driverId) ?? null;

  const onAssign = async () => {
    setAssignError(null);
    const parsed = assignTripSchema.safeParse({
      loadId,
      driverId,
      vehicleId,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setAssignError(issue ? t(issue.message) : t("console.loads.invalidId"));
      return;
    }

    try {
      await assignTrip.mutateAsync(parsed.data);
    } catch (error) {
      // `useAssignTrip` already maps the unique-index violations to a key.
      const key = error instanceof Error ? error.message : "console.load.assignFailed";
      setAssignError(t(key.startsWith("console.") ? key : "console.loads.assignFailed"));
    }
  };

  if (loadQuery.isError) {
    return (
      <View style={styles.screen} testID="load-detail-screen">
        <Banner message={t("console.loads.loadFailed")} variant="error" />
      </View>
    );
  }

  if (loadQuery.isSuccess && load === null) {
    return (
      <View style={styles.screen} testID="load-detail-screen">
        <Banner message={t("console.loads.detail.notFound")} variant="warning" />
        <Button label={t("common.cancel")} onPress={() => router.back()} variant="outline" />
      </View>
    );
  }

  if (load === null) {
    return <View style={styles.screen} testID="load-detail-screen" />;
  }

  const hasTrip = load.tripId !== null;
  const circles = [
    { id: "pickup", center: load.pickup, radiusM: load.pickup.radiusM },
    { id: "drop", center: load.drop, radiusM: load.drop.radiusM },
  ];
  const markers = [
    { id: "pickup", position: load.pickup, kind: "pickup" as const },
    { id: "drop", position: load.drop, kind: "drop" as const },
  ];
  // Straight line, not a road route — see the note at the top of this file.
  const planned = [
    {
      id: "planned",
      kind: "planned" as const,
      path: [load.pickup, load.drop],
    },
  ];

  return (
    <View style={styles.screen} testID="load-detail-screen">
      <View style={styles.header}>
        <View style={styles.headerMain}>
          <Chip label={load.loadCode} tone="accent" testID="load-detail-code" />
          <Text style={styles.route} testID="load-detail-route">
            {load.pickupAddress} → {load.dropAddress}
          </Text>
        </View>
        <LoadStatusChip
          label={t(
            `console.loads.${load.status === "in_trip" ? "filterInTrip" : `filter${load.status.charAt(0).toUpperCase()}${load.status.slice(1)}`}` as "console.loads.filterDone",
          )}
          status={load.status}
          testID="load-detail-status"
        />
      </View>

      <View style={styles.columns}>
        <Card style={styles.mapCard}>
          <AppMap circles={circles} fitToContent markers={markers} polylines={planned} />
          <Text style={styles.mapNote}>
            {t("console.loads.colPlannedKm")}: {formatKm(load.plannedDistanceM)}
          </Text>
        </Card>

        <ScrollView contentContainerStyle={styles.side} testID="load-detail-side">
          <Card>
            <SectionHeader title={t("console.loads.detail.summary")} />
            <View style={styles.stats}>
              <StatBlock
                label={t("console.loads.colPlannedKm")}
                value={formatKm(load.plannedDistanceM)}
              />
              <StatBlock
                label={t("console.loads.new.weight")}
                value={
                  load.weightKg === null
                    ? t("console.loads.notSet")
                    : `${(load.weightKg / 1000).toFixed(1)} t`
                }
              />
              <StatBlock
                label={t("console.loads.colMaterial")}
                value={load.material ?? t("console.loads.notSet")}
              />
              <StatBlock
                label={t("console.loads.detail.createdBy")}
                value={formatDate(load.createdAt, i18n.language)}
              />
            </View>
            {load.notes !== null && load.notes !== "" ? (
              <Text style={styles.notes}>{load.notes}</Text>
            ) : null}
          </Card>

          {hasTrip ? (
            <Card testID="load-detail-trip">
              <SectionHeader title={t("console.loads.detail.assign")} />
              {load.tripStatus !== null ? (
                <View style={styles.tripRow}>
                  <StatusChip audience="console" status={load.tripStatus} />
                </View>
              ) : null}
              <Text style={styles.tripLine}>
                {t("console.loads.detail.assignedTo", {
                  driver: load.driverName ?? t("console.loads.notSet"),
                  vehicle: load.vehicleNo ?? t("console.loads.notSet"),
                })}
              </Text>
              {load.driverBusy ? (
                <Banner message={t("console.loads.detail.busy")} variant="warning" />
              ) : null}
              <Text style={styles.hint}>{t("console.loads.detail.assignHint")}</Text>
            </Card>
          ) : (
            <Card testID="load-detail-assign">
              <SectionHeader title={t("console.loads.detail.assign")} />

              {assignError !== null ? (
                <Banner
                  message={assignError}
                  onDismiss={() => setAssignError(null)}
                  variant="error"
                />
              ) : null}

              {driversQuery.isError || vehiclesQuery.isError ? (
                <Banner message={t("console.loads.loadFailed")} variant="error" />
              ) : null}

              <SearchSelect
                emptyMessage={t("console.loads.detail.selectDriver")}
                label={t("console.loads.detail.driver")}
                onSelect={setDriverId}
                options={driverOptions}
                searchPlaceholder={t("console.loads.detail.driverSearch")}
                selectedKey={driverId}
                testID="assign-driver"
              />

              <SearchSelect
                disabled={vehicleOptions.length === 0}
                emptyMessage={t("console.loads.detail.selectVehicle")}
                label={t("console.loads.detail.vehicle")}
                onSelect={setVehicleId}
                options={vehicleOptions}
                searchPlaceholder={t("console.loads.detail.vehicleSearch")}
                selectedKey={vehicleId}
                testID="assign-vehicle"
              />

              {selectedDriver?.isBusy === true ? (
                <Banner message={t("console.loads.detail.busy")} variant="warning" />
              ) : null}

              <Button
                disabled={driverId === null || vehicleId === null}
                fullWidth
                label={t("console.loads.detail.submit")}
                loading={assignTrip.isPending}
                onPress={() => void onAssign()}
                size="lg"
                testID="assign-submit"
              />
              <Text style={styles.hint}>{t("console.loads.detail.assignHint")}</Text>
            </Card>
          )}
        </ScrollView>
      </View>
    </View>
  );
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
  headerMain: { flex: 1, gap: spacing.xs },
  route: { fontFamily: fonts.semibold, fontSize: fontSize.subtitle, color: colors.text },
  columns: { flex: 1, flexDirection: "row", gap: spacing.lg },
  mapCard: { flex: 1, padding: spacing.sm, borderRadius: radii.card },
  mapNote: {
    fontFamily: fonts.medium,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    textAlign: "center",
    paddingTop: spacing.xs,
  },
  side: { width: 420, gap: spacing.md },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  notes: { fontFamily: fonts.regular, fontSize: fontSize.body, color: colors.textSecondary },
  tripRow: { flexDirection: "row", gap: spacing.sm },
  tripLine: { fontFamily: fonts.medium, fontSize: fontSize.body, color: colors.text },
  hint: { fontFamily: fonts.regular, fontSize: fontSize.caption, color: colors.textSecondary },
  outline: {
    borderWidth: borderWidth.hairline,
    borderColor: colors.border,
  },
});
