import { useNetInfo } from "@react-native-community/netinfo";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Banner, Button, Card, Chip, EmptyState, Icon, StatusChip } from "@/components/ui";
import { currentPlatform } from "@/features/auth/platform";
import { useAuthStore } from "@/features/auth/store";
import { useProfile } from "@/features/auth/useProfile";
import { useDriverTrips, type DriverTrip } from "@/features/trips/useDriverTrips";
import { colors, fonts, fontSize, spacing } from "@/theme/tokens";
import { readLocalTrackingState } from "@/tracking/localState";

/**
 * D3 My Trips (docs/12 D3) — the driver's home tab.
 *
 * The pinned live card is driven by the *local* tracking state, not the server
 * list: if the phone was mid-trip when the app died, `useAuthBootstrap` has
 * already restarted the task, and the pin must survive even a total network
 * loss. The assigned list is server state and gets the empty / offline
 * treatments. Pull to refresh re-reads both.
 */
export default function MyTripsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const profileQuery = useProfile();
  const userId = useAuthStore((state) => state.userId);

  // The active trip comes from the auth store, which `useAuthBootstrap` fills
  // from the local tracking state at launch (and re-reads after a resume) —
  // so this screen renders the pin without a second async read in an effect.
  const activeTripId = useAuthStore((state) => state.activeTripId);
  const [pendingPoints, setPendingPoints] = useState(0);

  const tripsQuery = useDriverTrips(userId);
  const netInfo = useNetInfo();
  const offline = netInfo.isConnected === false;

  const readPending = useCallback(async () => {
    const local = await readLocalTrackingState();
    setPendingPoints(local.pendingPoints);
  }, []);

  // Refresh on pull; the launch bootstrap owns the initial read.
  const refresh = useCallback(async () => {
    await Promise.all([readPending(), tripsQuery.refetch(), profileQuery.refetch()]);
  }, [readPending, tripsQuery, profileQuery]);

  // Assigned = not currently being recorded on this phone.
  const assigned = useMemo(
    () => tripsQuery.data?.filter((trip) => trip.id !== activeTripId) ?? [],
    [tripsQuery.data, activeTripId],
  );

  const firstName = (profileQuery.data?.fullName ?? "").split(" ")[0] ?? "";
  const platform = currentPlatform();

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="driver-trips-screen">
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={tripsQuery.isRefetching} onRefresh={() => void refresh()} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.greeting}>
            {t("driver.trips.greeting", { name: firstName || t("driver.trips.driverFallback") })}
          </Text>
          {activeTripId !== null && pendingPoints > 0 ? (
            <Chip
              icon="cloud_off"
              label={t("driver.trips.syncPending", { count: pendingPoints })}
              tone="review"
            />
          ) : (
            <Chip icon="cloud_done" label={t("driver.trips.synced")} tone="verified" />
          )}
        </View>

        {offline ? (
          <Banner message={t("common.offline")} testID="driver-trips-offline" variant="offline" />
        ) : null}

        {activeTripId !== null ? (
          <Card
            accentColor={colors.live}
            elevated
            style={styles.liveCard}
            testID="driver-trips-live-card"
          >
            <View style={styles.liveHeader}>
              <StatusChip status="in_progress" />
              <Text style={styles.liveCode}>NL</Text>
            </View>
            <Button
              fullWidth
              label={t("driver.trips.resume")}
              onPress={() =>
                router.push({ pathname: "/(driver)/trips/[id]/live", params: { id: activeTripId } })
              }
              size="driver"
              testID="driver-trips-resume"
            />
          </Card>
        ) : null}

        <Text style={styles.section}>{t("driver.trips.assignedSection")}</Text>

        {tripsQuery.isLoading ? (
          <ActivityIndicator
            color={colors.accent}
            style={styles.spinner}
            testID="driver-trips-loading"
          />
        ) : tripsQuery.isError ? (
          <Banner
            message={t("driver.trips.loadFailed")}
            actionLabel={t("common.retry")}
            onAction={() => void tripsQuery.refetch()}
            testID="driver-trips-error"
            variant="error"
          />
        ) : assigned.length === 0 ? (
          <EmptyState
            icon="local_shipping"
            message={t("driver.trips.emptyMessage")}
            testID="driver-trips-empty"
            title={t("driver.trips.emptyTitle")}
          />
        ) : (
          <View style={styles.list}>
            {assigned.map((trip) => (
              <AssignedCard
                key={trip.id}
                disabled={platform === "web"}
                onPress={() =>
                  router.push({ pathname: "/(driver)/trips/[id]", params: { id: trip.id } })
                }
                trip={trip}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** One assigned-trip card: Load ID chip, route, material, vehicle, status. */
function AssignedCard({
  trip,
  onPress,
  disabled,
}: {
  trip: DriverTrip;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Card
      onPress={disabled ? undefined : onPress}
      style={styles.assignedCard}
      testID={`driver-trip-card-${trip.id}`}
    >
      <Chip icon="confirmation_number" label={trip.loadCode} tone="accent" />
      <Text style={styles.route} numberOfLines={2}>
        {trip.pickup} → {trip.drop}
      </Text>
      <View style={styles.metaRow}>
        {trip.material !== null ? (
          <View style={styles.metaItem}>
            <Icon name="inventory_2" size={14} color={colors.textSecondary} />
            <Text style={styles.metaText}>{trip.material}</Text>
          </View>
        ) : null}
        <View style={styles.metaItem}>
          <Icon name="local_shipping" size={14} color={colors.textSecondary} />
          <Text style={styles.metaText}>{trip.vehicleNo}</Text>
        </View>
      </View>
      <StatusChip status={trip.status} />
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  greeting: { fontFamily: fonts.semibold, fontSize: fontSize.title, color: colors.text },
  liveCard: { gap: spacing.md },
  liveHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  liveCode: { fontFamily: fonts.semibold, fontSize: fontSize.body, color: colors.text },
  section: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.subtitle,
    color: colors.text,
    marginTop: spacing.sm,
  },
  spinner: { marginVertical: spacing.xl },
  list: { gap: spacing.md },
  assignedCard: { gap: spacing.sm },
  route: { fontFamily: fonts.medium, fontSize: fontSize.body, color: colors.text },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  metaItem: { flexDirection: "row", alignItems: "center", gap: spacing.xxs },
  metaText: { fontFamily: fonts.regular, fontSize: fontSize.caption, color: colors.textSecondary },
});
