/**
 * D5 presentation (M10, docs/12 D5).
 *
 * Kept as a presentational pair — `LiveTripHeader` floats over the map and
 * `LiveTripSheet` is the bottom panel — so the states the driver actually sees
 * (synced / N waiting / offline, GPS good / weak / lost, a tracking problem,
 * near the drop) can be tested as components instead of only through the
 * screen's effect chain. The screen owns data, navigation and the end flow.
 *
 * The panel is deliberately sparse: three big numbers, two status rows, the
 * problem banner and one button. It is read at a glance, one-handed, in a cab.
 */
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Banner, Button, Card, Chip, Icon, StatBlock } from "@/components/ui";
import type {
  AgoUnit,
  LiveGpsState,
  LiveSyncState,
  TrackingProblem,
} from "@/features/trips/liveState";
import { colors, fonts, fontSize, radii, spacing, touch } from "@/theme/tokens";

export type LiveTripHeaderProps = {
  loadCode: string;
  /** Place name the load is going to — "To Coimbatore". */
  destination: string;
  keepAwakeEnabled: boolean;
  onToggleKeepAwake: () => void;
};

/** Floating card over the map: Live chip, Load ID, destination, wake toggle. */
export function LiveTripHeader({
  loadCode,
  destination,
  keepAwakeEnabled,
  onToggleKeepAwake,
}: LiveTripHeaderProps) {
  const { t } = useTranslation();
  return (
    <Card elevated padded={false} style={styles.header} testID="driver-live-header">
      <Chip
        icon="trip_origin"
        label={t("driver.live.live")}
        tone="live"
        testID="driver-live-chip"
      />
      <View style={styles.headerText}>
        <Text style={styles.loadCode}>{loadCode}</Text>
        <Text style={styles.destination} numberOfLines={1}>
          {t("driver.live.toDestination", { destination })}
        </Text>
      </View>
      <Pressable
        accessibilityLabel={
          keepAwakeEnabled ? t("driver.live.keepAwakeOn") : t("driver.live.keepAwakeOff")
        }
        accessibilityRole="button"
        accessibilityState={{ selected: keepAwakeEnabled }}
        onPress={onToggleKeepAwake}
        style={styles.keepAwake}
        testID="driver-live-keep-awake"
      >
        <Icon
          color={keepAwakeEnabled ? colors.accent : colors.textSecondary}
          name={keepAwakeEnabled ? "lightbulb" : "lightbulb_outline"}
          size={22}
        />
      </Pressable>
    </Card>
  );
}

export type LiveTripSheetProps = {
  elapsed: string;
  /** Approximate kilometres from the local trace (docs/08's rule, rounded). */
  approxKm: number;
  /** Straight-line kilometres to the drop, or null before the first point. */
  kmToDrop: number | null;
  sync: LiveSyncState;
  pendingPoints: number;
  /** "20 s ago" parts for the synced row, or null when nothing has synced yet. */
  syncedAgo: { unit: AgoUnit; count: number } | null;
  gps: LiveGpsState;
  gpsAccuracyM: number | null;
  problem: TrackingProblem | null;
  nearDrop: boolean;
  ending: boolean;
  /** A failed `end_trip` to show, e.g. the connection died mid-end. */
  endError?: string | null;
  /** "Open settings" action on the permission banner. */
  onOpenSettings: () => void;
  onEnd: () => void;
};

export function LiveTripSheet({
  elapsed,
  approxKm,
  kmToDrop,
  sync,
  pendingPoints,
  syncedAgo,
  gps,
  gpsAccuracyM,
  problem,
  nearDrop,
  ending,
  endError = null,
  onOpenSettings,
  onEnd,
}: LiveTripSheetProps) {
  const { t } = useTranslation();

  return (
    <Card padded={false} style={styles.sheet} testID="driver-live-sheet">
      <View style={styles.stats}>
        <StatBlock
          label={t("driver.live.timeLabel")}
          size="md"
          testID="driver-live-stat-time"
          value={elapsed}
        />
        <StatBlock
          caption={t("driver.live.distanceCaption")}
          label={t("driver.live.distanceLabel")}
          size="md"
          testID="driver-live-stat-distance"
          value={`${approxKm} km`}
        />
        <StatBlock
          caption={t("driver.live.toDropCaption")}
          label={t("driver.live.toDropLabel")}
          size="md"
          testID="driver-live-stat-to-drop"
          value={kmToDrop === null ? "—" : `${kmToDrop} km`}
        />
      </View>

      <SyncRow pendingPoints={pendingPoints} sync={sync} syncedAgo={syncedAgo} />
      <GpsRow accuracyM={gpsAccuracyM} gps={gps} />

      {problem === "stale" ? (
        <Banner
          message={t("driver.live.problemStale")}
          testID="driver-live-problem-stale"
          variant="warning"
        />
      ) : null}
      {problem === "permission" ? (
        <Banner
          actionLabel={t("driver.live.problemFix")}
          message={t("driver.live.problemPermission")}
          onAction={onOpenSettings}
          testID="driver-live-problem-permission"
          variant="error"
        />
      ) : null}

      {nearDrop ? (
        <Banner
          message={t("driver.live.nearDrop")}
          testID="driver-live-near-drop"
          variant="success"
        />
      ) : null}

      {endError !== null ? (
        <Banner message={endError} testID="driver-live-end-error" variant="error" />
      ) : null}

      <Button
        fullWidth
        icon="stop_circle"
        label={t("driver.live.end")}
        loading={ending}
        onPress={onEnd}
        size="lg"
        testID="driver-live-end"
        variant={nearDrop ? "danger" : "dangerOutline"}
      />
      <Text style={styles.hint}>{t("driver.live.endHint")}</Text>
    </Card>
  );
}

/** One row: cloud icon, the sync story, in the colour of that story. */
function SyncRow({
  sync,
  pendingPoints,
  syncedAgo,
}: {
  sync: LiveSyncState;
  pendingPoints: number;
  syncedAgo: { unit: AgoUnit; count: number } | null;
}) {
  const { t } = useTranslation();

  const variant = sync === "synced" ? "verified" : "review";
  const icon = sync === "synced" ? "cloud_done" : "cloud_off";
  const tone = colors[variant];

  let label: string;
  if (sync === "offline") {
    label =
      pendingPoints > 0
        ? t("driver.live.syncOffline", { count: pendingPoints })
        : t("driver.live.syncOfflineClean");
  } else if (sync === "pending") {
    label = t("driver.live.syncPending", { count: pendingPoints });
  } else {
    label =
      syncedAgo === null
        ? t("driver.live.syncSynced")
        : t("driver.live.syncSyncedAgo", {
            ago: t(agoKey(syncedAgo.unit), { count: syncedAgo.count }),
          });
  }

  return (
    <View style={styles.statusRow} testID="driver-live-sync">
      <Icon color={tone} name={icon} size={20} />
      <Text style={[styles.statusText, { color: tone }]}>{label}</Text>
    </View>
  );
}

/** One row: GPS quality from the newest fix's accuracy. */
function GpsRow({ gps, accuracyM }: { gps: LiveGpsState; accuracyM: number | null }) {
  const { t } = useTranslation();
  const tone =
    gps === "good" ? colors.verified : gps === "weak" ? colors.review : colors.textSecondary;

  return (
    <View style={styles.statusRow} testID="driver-live-gps">
      <Icon
        color={tone}
        name={gps === "good" ? "gps_fixed" : gps === "weak" ? "gps_not_fixed" : "gps_off"}
        size={20}
      />
      <Text style={[styles.statusText, { color: tone }]}>
        {gps === "good"
          ? t("driver.live.gpsGood")
          : gps === "weak"
            ? t("driver.live.gpsWeak", { metres: Math.round(accuracyM ?? 0) })
            : t("driver.live.gpsLost")}
      </Text>
    </View>
  );
}

function agoKey(unit: AgoUnit): string {
  switch (unit) {
    case "seconds":
      return "driver.live.agoSeconds";
    case "minutes":
      return "driver.live.agoMinutes";
    case "hours":
      return "driver.live.agoHours";
  }
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.card,
  },
  headerText: { flex: 1, gap: spacing.xxs },
  loadCode: { fontFamily: fonts.semibold, fontSize: fontSize.body, color: colors.text },
  destination: {
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
  keepAwake: {
    width: touch.min,
    height: touch.min,
    alignItems: "center",
    justifyContent: "center",
  },
  sheet: {
    gap: spacing.md,
    padding: spacing.md,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  stats: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  statusText: { flex: 1, fontFamily: fonts.medium, fontSize: fontSize.caption },
  hint: {
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    textAlign: "center",
  },
});
