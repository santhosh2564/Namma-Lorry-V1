import { MaterialIcons } from '@expo/vector-icons';
import { useNetInfo } from '@react-native-community/netinfo';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { Banner, Button, Card, Chip, Screen, Text } from '@/components/ui';
import { useProfile } from '@/features/auth/useProfile';
import { localTripQueryKey } from '@/features/auth/useRoutingDecision';
import { formatDuration } from '@/features/loads/status';
import { cargoText, shortPlace, useMyTrips, type DriverTrip } from '@/features/trips/api';
import { firstName, homeSections } from '@/features/trips/home';
import { t, useLanguage } from '@/i18n';
import { useNow } from '@/lib/useNow';
import { getLocalTripState } from '@/tracking/localState';
import { colors, radius, space } from '@/theme/tokens';

const s = t.trips;

/** D3 My Trips (docs/12 D3): live trip pinned, assigned trips, empty and offline states. */
export default function MyTrips() {
  useLanguage(); // re-render on language change (M12a)
  const router = useRouter();
  const profile = useProfile();
  const trips = useMyTrips();
  // Local state works offline: the pinned card must show even without a network.
  const local = useQuery({ queryKey: localTripQueryKey, queryFn: getLocalTripState, networkMode: 'always' });
  const net = useNetInfo();
  const offline = net.isConnected === false || net.isInternetReachable === false;
  const now = useNow();
  const [refreshing, setRefreshing] = useState(false);

  const unsyncedTripId = local.data?.unsyncedTripId ?? null;
  const sections = homeSections(trips.data, local.data?.activeTripId ?? null, unsyncedTripId);
  const vehicle = (sections.live?.trip ?? sections.assigned[0])?.vehicle?.registration_no;

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([trips.refetch(), local.refetch()]);
    setRefreshing(false);
  }

  return (
    <Screen
      scroll
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void onRefresh()}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text variant="title" accessibilityRole="header" testID="d3-greeting">
            {s.greeting(firstName(profile.data?.full_name) || t.common.appName)}
          </Text>
          {vehicle ? <Chip label={vehicle} icon="local-shipping" /> : null}
        </View>
        <MaterialIcons
          name={offline ? 'cloud-off' : 'cloud-done'}
          size={24}
          color={offline ? colors.review : colors.verified}
          accessibilityLabel={offline ? t.a11y.offline : t.a11y.online}
        />
      </View>

      {offline ? <Banner tone="warn" message={s.offline} testID="d3-offline" /> : null}
      {trips.isError && !offline ? <Banner tone="error" message={s.loadFailed} testID="d3-error" /> : null}

      {unsyncedTripId ? (
        <View style={styles.section} testID="d3-unsynced">
          <Banner tone="info" message={t.summary.offlineBody} />
          <Button
            label={t.summary.offlineTitle}
            variant="outline"
            icon="chevron-right"
            onPress={() => router.push(`/driver/trips/${unsyncedTripId}/summary`)}
          />
        </View>
      ) : null}

      {sections.live ? (
        <LiveCard
          trip={sections.live.trip}
          pendingPoints={local.data?.pendingPoints ?? 0}
          now={now}
          onResume={() => router.push(`/driver/trips/${sections.live!.id}/live`)}
        />
      ) : null}

      {sections.assigned.length > 0 ? (
        <View style={styles.section}>
          <Text variant="subtitle">{s.assigned}</Text>
          {sections.assigned.map((trip) => (
            <AssignedCard key={trip.id} trip={trip} onPress={() => router.push(`/driver/trips/${trip.id}`)} />
          ))}
        </View>
      ) : null}

      {sections.empty && trips.isSuccess ? (
        <View style={styles.empty} testID="d3-empty">
          <View style={styles.emptyIcon}>
            <MaterialIcons name="local-shipping" size={48} color={colors.textSecondary} />
          </View>
          <Text variant="subtitle" align="center">
            {s.emptyTitle}
          </Text>
          <Text tone="secondary" align="center">
            {s.emptyBody}
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}

function Route({ trip }: { trip: DriverTrip }) {
  if (!trip.load) return null;
  return (
    <View style={styles.route}>
      <MaterialIcons name="place" size={18} color={colors.verified} />
      <Text variant="bodyStrong" style={styles.flex} numberOfLines={2}>
        {shortPlace(trip.load.pickup_address)} → {shortPlace(trip.load.drop_address)}
      </Text>
    </View>
  );
}

function LiveCard({
  trip,
  pendingPoints,
  now,
  onResume,
}: {
  trip: DriverTrip | null;
  pendingPoints: number;
  now: number;
  onResume: () => void;
}) {
  return (
    <Card style={styles.liveCard}>
      <View style={styles.rowBetween}>
        <Chip label={s.live} tone="live" icon="sensors" />
        {trip?.load ? (
          <Text variant="caption" tone="secondary">
            {trip.load.load_code}
          </Text>
        ) : null}
      </View>
      <Text variant="bodyStrong" testID="d3-live">
        {s.tripInProgress}
      </Text>
      {trip ? <Route trip={trip} /> : null}
      {trip?.started_at ? (
        <Text tone="secondary">
          {s.elapsed(formatDuration(trip.started_at, new Date(now).toISOString()))}
        </Text>
      ) : null}
      {pendingPoints > 0 ? (
        <Text variant="caption" tone="secondary">
          {s.pendingPoints(pendingPoints)}
        </Text>
      ) : null}
      <Button label={s.resume} size="driver" icon="play-arrow" onPress={onResume} testID="d3-resume" />
    </Card>
  );
}

function AssignedCard({ trip, onPress }: { trip: DriverTrip; onPress: () => void }) {
  return (
    <Card>
      <View style={styles.rowBetween}>
        {trip.load ? <Chip label={trip.load.load_code} tone="accent" /> : <View />}
        <Chip label={s.readyToStart} tone="verified" icon="check-circle-outline" />
      </View>
      <Route trip={trip} />
      {trip.load ? (
        <View style={styles.meta}>
          <MaterialIcons name="inventory-2" size={16} color={colors.textSecondary} />
          <Text variant="caption" tone="secondary">
            {cargoText(trip.load)}
          </Text>
        </View>
      ) : null}
      {trip.vehicle ? (
        <View style={styles.meta}>
          <MaterialIcons name="local-shipping" size={16} color={colors.textSecondary} />
          <Text variant="caption" tone="secondary">
            {trip.vehicle.registration_no}
          </Text>
        </View>
      ) : null}
      <Button
        label={s.viewDetails}
        variant="outline"
        icon="chevron-right"
        onPress={onPress}
        testID={`d3-trip-${trip.id}`}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: space.xs },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  section: { gap: space.md },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  liveCard: { borderLeftWidth: 4, borderLeftColor: colors.live },
  route: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  meta: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: radius.card,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
