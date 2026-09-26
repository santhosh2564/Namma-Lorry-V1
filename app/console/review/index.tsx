import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { MapView } from '@/components/map/MapView';
import type { MapMarker } from '@/components/map/types';
import { Banner, Button, Card, Chip, Text } from '@/components/ui';
import { useReviewQueue, type QueueTrip } from '@/features/review/api';
import { ageText } from '@/features/review/liveBoard';
import { reasonViews } from '@/features/trips/summaryModel';
import { t } from '@/i18n/en';
import { useNow } from '@/lib/useNow';
import { colors, fonts, radius, space } from '@/theme/tokens';

const c = t.console.reviewQueue;

/** C7 Review Queue (docs/12 C7): needs_review trips, oldest first. */
export default function ReviewQueue() {
  const router = useRouter();
  const queue = useReviewQueue();
  const now = useNow(60_000);
  const { width } = useWindowDimensions();
  const rows = queue.data ?? [];

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.titleRow}>
        <Text variant="title" testID="c7-title">
          {queue.data ? c.title(rows.length) : t.console.nav.review}
        </Text>
        <Chip label={c.oldestFirst} icon="sort" />
      </View>
      {queue.isError ? <Banner tone="error" message={t.console.loadError} /> : null}
      {queue.isPending ? (
        <ActivityIndicator color={colors.primary} />
      ) : rows.length === 0 && !queue.isError ? (
        <Card style={styles.empty}>
          <MaterialIcons name="task-alt" size={48} color={colors.verified} />
          <Text variant="subtitle" testID="c7-empty">
            {c.emptyTitle}
          </Text>
          <Text tone="secondary">{c.emptyBody}</Text>
        </Card>
      ) : (
        rows.map((trip) => (
          <QueueCard
            key={trip.id}
            trip={trip}
            now={now}
            wide={width >= 900}
            onOpen={() => router.push(`/console/trips/${trip.id}`)}
          />
        ))
      )}
    </ScrollView>
  );
}

function QueueCard({
  trip,
  now,
  wide,
  onOpen,
}: {
  trip: QueueTrip;
  now: number;
  wide: boolean;
  onOpen: () => void;
}) {
  const reasons = reasonViews(trip.verification_reasons, trip.verification_metrics);
  const l = trip.load;
  const markers: MapMarker[] = [
    ...(l
      ? [{ id: 'pickup', kind: 'pickup' as const, position: { lat: l.pickup_lat, lng: l.pickup_lng } }]
      : []),
    ...(l ? [{ id: 'drop', kind: 'drop' as const, position: { lat: l.drop_lat, lng: l.drop_lng } }] : []),
    ...(trip.end_lat !== null && trip.end_lng !== null
      ? [{ id: 'end', kind: 'end' as const, position: { lat: trip.end_lat, lng: trip.end_lng } }]
      : []),
  ];
  return (
    <Card>
      <View style={[styles.cardRow, !wide && styles.cardStack]}>
        <View style={styles.cardMain}>
          <View style={styles.headRow}>
            <View style={styles.code}>
              <Text style={styles.codeText}>{l?.load_code ?? '—'}</Text>
            </View>
            <Text variant="bodyStrong">{trip.driver?.full_name ?? '—'}</Text>
            <Text tone="secondary">{trip.vehicle?.registration_no ?? '—'}</Text>
            {trip.ended_at ? (
              <Text variant="caption" tone="secondary">
                {c.ended(ageText(Math.max(0, now - Date.parse(trip.ended_at))))}
              </Text>
            ) : null}
          </View>
          {l ? (
            <Text tone="secondary">
              {l.pickup_address.split(',')[0]} → {l.drop_address.split(',')[0]}
            </Text>
          ) : null}
          <View style={styles.chips} testID={`c7-reasons-${trip.id}`}>
            {reasons.map((r) => (
              <Chip key={r.code} tone="review" icon="warning-amber" label={t.reasons[r.key](r.value)} />
            ))}
          </View>
          <View style={styles.button}>
            <Button label={c.open} icon="chevron-right" onPress={onOpen} testID={`c7-open-${trip.id}`} />
          </View>
        </View>
        <View style={wide ? styles.mini : undefined}>
          <MapView
            height={180}
            fitToContent
            fitKey={trip.id}
            markers={markers}
            polylines={
              l
                ? [
                    {
                      id: 'planned',
                      kind: 'planned',
                      path: [
                        { lat: l.pickup_lat, lng: l.pickup_lng },
                        { lat: l.drop_lat, lng: l.drop_lng },
                      ],
                    },
                  ]
                : []
            }
            circles={
              l
                ? [{ id: 'drop-r', center: { lat: l.drop_lat, lng: l.drop_lng }, radiusM: l.drop_radius_m }]
                : []
            }
          />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  empty: { alignItems: 'center', paddingVertical: space.xl },
  cardRow: { flexDirection: 'row', gap: space.lg },
  cardStack: { flexDirection: 'column' },
  cardMain: { flex: 1, gap: space.sm },
  headRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md },
  code: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.chip,
    paddingHorizontal: space.md,
    paddingVertical: 2,
  },
  codeText: { fontFamily: fonts.semibold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  button: { alignSelf: 'flex-start', minWidth: 200 },
  mini: { width: 300 },
});
