import { useNetInfo } from "@react-native-community/netinfo";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, View } from "react-native";

import { Banner, Button, EmptyState, Screen } from "@/components/ui";
import { useAuthStore } from "@/features/auth/store";
import { formatElapsed } from "@/features/trips/liveState";
import {
  formatTripDate,
  kmFromMetres,
  readMetrics,
  summaryVariant,
} from "@/features/trips/summaryState";
import { TripSummaryPanel } from "@/features/trips/TripSummaryPanel";
import { useTripSummary } from "@/features/trips/useTripSummary";
import { colors, spacing } from "@/theme/tokens";

/**
 * D6 Trip Summary (docs/12 D6).
 *
 * Reached from D5's End flow (and from the history list later). The trip row is
 * subscribed to over realtime with a polling fallback, so the verdict lands
 * without the driver pulling to refresh — and when the end happened offline the
 * screen says so instead of spinning forever.
 *
 * The screen deliberately shows **only** what Postgres decided: official
 * kilometres, the verifier's reasons in plain language, and the totals from
 * `driver_stats`. Nothing here is computed locally.
 */
export default function TripSummaryScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { id } = useLocalTripId();
  const { tripQuery, statsQuery } = useTripSummary(id);
  const netInfo = useNetInfo();
  const activeTripId = useAuthStore((state) => state.activeTripId);

  const back = () => router.replace("/(driver)");

  if (tripQuery.isLoading) {
    return (
      <Screen testID="driver-trip-summary-loading">
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  const trip = tripQuery.data ?? null;

  if (tripQuery.isError || trip === null) {
    return (
      <Screen testID="driver-trip-summary-error">
        <Stack.Screen options={{ headerShown: false }} />
        <EmptyState
          icon="report"
          message={t("driver.summary.loadFailed")}
          title={t("driver.summary.notFound")}
        />
        <View style={styles.action}>
          <Button
            fullWidth
            label={t("driver.summary.back")}
            onPress={back}
            testID="trip-summary-back"
          />
        </View>
      </Screen>
    );
  }

  // "Ended offline": the phone still owes the server this trip's ending, either
  // because the local state says so (`activeTripId`) or because there is no
  // connection right now.
  const offlineEnded = activeTripId === trip.id || netInfo.isConnected === false;
  const variant = summaryVariant(trip.status, offlineEnded);
  const durationLabel =
    trip.startedAt === null || trip.endedAt === null
      ? null
      : formatElapsed(trip.startedAt, Date.parse(trip.endedAt));

  return (
    <Screen scroll testID="driver-trip-summary-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <TripSummaryPanel
        dateLabel={formatTripDate(trip.endedAt ?? trip.startedAt)}
        durationLabel={durationLabel}
        loadCode={trip.loadCode}
        metrics={readMetrics(trip.verificationMetrics)}
        onBack={back}
        reasonCodes={trip.verificationReasons}
        route={`${trip.pickup} → ${trip.drop}`}
        totals={statsQuery.data ?? null}
        trackedKm={kmFromMetres(trip.trackedDistanceM)}
        variant={variant}
      />
      {statsQuery.isError ? (
        <View style={styles.action}>
          <Banner
            actionLabel={t("common.retry")}
            message={t("driver.summary.totalsFailed")}
            onAction={() => void statsQuery.refetch()}
            testID="trip-summary-totals-error"
            variant="error"
          />
        </View>
      ) : null}
    </Screen>
  );
}

/** `useLocalSearchParams` typed once, so the screen body stays readable. */
function useLocalTripId(): { id: string | null } {
  const params = useLocalSearchParams<{ id: string }>();
  const raw = params.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  return { id: id ?? null };
}

const styles = {
  center: { flex: 1, alignItems: "center" as const, justifyContent: "center" as const },
  action: { marginTop: spacing.md },
};
