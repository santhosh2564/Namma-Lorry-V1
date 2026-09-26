// /dev/tracking: developer view of the tracking engine (dev builds only; hidden in M12a).
// On web, location comes from a simulator so the queue → upload → end flow can be driven by hand.
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Banner, Button, Card, Screen, Text, TextField } from '@/components/ui';
import type { PointRow, TripStateRow } from '@/tracking/db';
import { TripError, tripErrorText } from '@/tracking/errors';
import { counts, lastPoint, listTripStates, type QueueCounts } from '@/tracking/queue';
import { getSimulatedLocation, getTracking, setSimulatedPosition, syncTick } from '@/tracking/runtime';
import { handleLocationUpdate } from '@/tracking/taskHandler';
import { colors, fonts, space } from '@/theme/tokens';

interface Snapshot {
  states: TripStateRow[];
  counts: QueueCounts;
  last: PointRow | null;
  uploader: { failures: number; retryInS: number; busy: boolean };
}

async function loadSnapshot(): Promise<Snapshot> {
  const { db, uploader } = await getTracking();
  const states = await listTripStates(db);
  const current = states.at(-1);
  const u = uploader.status();
  return {
    states,
    counts: await counts(db),
    last: current ? await lastPoint(db, current.trip_id) : null,
    uploader: {
      failures: u.failures,
      busy: u.busy,
      retryInS: Math.max(0, Math.round((u.nextAttemptAt - Date.now()) / 1000)),
    },
  };
}

export default function DevTracking() {
  if (!__DEV__) {
    return (
      <Screen>
        <Text>Not available.</Text>
      </Screen>
    );
  }
  return <DevTrackingInner />;
}

function DevTrackingInner() {
  // networkMode 'always': this reads local SQLite, so it must keep refreshing while offline.
  const snapshot = useQuery({
    queryKey: ['dev', 'tracking'],
    queryFn: loadSnapshot,
    refetchInterval: 2000,
    networkMode: 'always',
  });
  const snap = snapshot.data;
  const refresh = () => void snapshot.refetch();
  const [tripId, setTripId] = useState('');
  const [pos, setPos] = useState('12.7409, 77.8253');
  const [message, setMessage] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      const r = await fn();
      setMessage({ tone: 'info', text: `${label}: ${JSON.stringify(r ?? 'ok')}` });
    } catch (e) {
      setMessage({
        tone: 'error',
        text: e instanceof TripError ? `${e.code}: ${tripErrorText(e)}` : String(e),
      });
    } finally {
      setBusy(false);
      refresh();
    }
  }

  async function simulate(n: number, mocked = false) {
    const { db } = await getTracking();
    const sim = getSimulatedLocation();
    let inserted = 0;
    for (let i = 0; i < n; i++) {
      inserted += await handleLocationUpdate(async () => db, [sim.step(150, mocked)], Date.now);
      await new Promise((r) => setTimeout(r, 5)); // distinct timestamps
    }
    return { inserted };
  }

  const current = snap?.states.at(-1);
  const web = Platform.OS === 'web';

  return (
    <Screen scroll>
      <Text variant="title">Tracking (dev)</Text>
      <Text variant="caption" tone="secondary">
        {web
          ? 'Web: location is simulated. start_trip / end_trip and uploads hit the real backend as the signed-in user.'
          : 'Native: real GPS through the background task.'}
      </Text>

      {snapshot.isError ? (
        <Banner tone="error" message={`Tracking DB unavailable: ${String(snapshot.error)}`} />
      ) : null}
      {message ? <Banner tone={message.tone} message={message.text} testID="dev-message" /> : null}

      <Card>
        <Text variant="subtitle">State</Text>
        {snap?.states.length ? (
          snap.states.map((s) => (
            <View key={s.trip_id} style={styles.kv} testID="dev-state">
              <Text style={styles.mono}>
                {s.trip_id.slice(0, 8)}… {s.state} next_seq={s.next_seq}
                {s.last_seq !== null ? ` last_seq=${s.last_seq}` : ''}
                {s.server_status ? ` server=${s.server_status}` : ''}
                {s.last_error ? ` error=${s.last_error}` : ''}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.mono} testID="dev-state">
            IDLE
          </Text>
        )}
        <Text style={styles.mono} testID="dev-counts">
          pending={snap?.counts.pending ?? 0} uploaded={snap?.counts.uploaded ?? 0} rejected=
          {snap?.counts.rejected ?? 0}
        </Text>
        <Text style={styles.mono}>
          uploader failures={snap?.uploader.failures ?? 0}
          {snap?.uploader.retryInS ? ` retry in ${snap.uploader.retryInS}s` : ''}
          {snap?.uploader.busy ? ' (uploading)' : ''}
        </Text>
        <Text style={styles.mono} testID="dev-last">
          last point:{' '}
          {snap?.last
            ? `#${snap.last.seq} ${snap.last.lat.toFixed(5)},${snap.last.lng.toFixed(5)} ±${snap.last.accuracy_m ?? '?'}m ${snap.last.recorded_at}${snap.last.is_mocked ? ' MOCKED' : ''}`
            : '—'}
        </Text>
      </Card>

      <Card>
        <Text variant="subtitle">Trip</Text>
        <TextField
          testID="dev-trip-id"
          label="Trip ID (assigned to the signed-in driver)"
          value={tripId}
          onChangeText={setTripId}
          autoCapitalize="none"
        />
        {web ? (
          <TextField
            testID="dev-position"
            label="Simulated position (lat, lng)"
            value={pos}
            onChangeText={(v) => {
              setPos(v);
              const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(v);
              if (m) setSimulatedPosition({ lat: Number(m[1]), lng: Number(m[2]), accuracy: 8 });
            }}
          />
        ) : null}
        <View style={styles.row}>
          <Button
            testID="dev-start"
            label="Start trip"
            disabled={!tripId || busy}
            onPress={() => run('start', async () => (await getTracking()).engine.startTrip(tripId.trim()))}
          />
          <Button
            testID="dev-end"
            label="End trip"
            variant="danger"
            disabled={busy || !current}
            onPress={() => run('end', async () => (await getTracking()).engine.endTrip())}
          />
        </View>
      </Card>

      <Card>
        <Text variant="subtitle">Queue</Text>
        <View style={styles.row}>
          {web ? (
            <>
              <Button
                testID="dev-sim-1"
                label="Simulate point"
                variant="outline"
                disabled={busy}
                onPress={() => run('simulate', () => simulate(1))}
              />
              <Button
                testID="dev-sim-20"
                label="Simulate 20"
                variant="outline"
                disabled={busy}
                onPress={() => run('simulate', () => simulate(20))}
              />
              <Button
                label="Simulate mocked"
                variant="outline"
                disabled={busy}
                onPress={() => run('simulate', () => simulate(1, true))}
              />
            </>
          ) : null}
          <Button
            testID="dev-flush"
            label="Flush now"
            variant="outline"
            disabled={busy}
            onPress={() => run('flush', async () => (await getTracking()).uploader.flushAll())}
          />
          <Button
            label="Sync tick"
            variant="outline"
            disabled={busy}
            onPress={() => run('sync', () => syncTick(true))}
          />
          <Button
            testID="dev-resume"
            label="Resume on launch"
            variant="outline"
            disabled={busy}
            onPress={() => run('resume', async () => (await getTracking()).engine.resumeOnLaunch())}
          />
          <Button
            label="Clean up finished"
            variant="outline"
            disabled={busy}
            onPress={() => run('cleanup', async () => (await getTracking()).engine.cleanupFinished())}
          />
        </View>
      </Card>

      <ScrollView />
    </Screen>
  );
}

const styles = StyleSheet.create({
  kv: { gap: space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  mono: {
    fontFamily: Platform.select({ web: 'monospace', default: fonts.regular }),
    fontSize: 13,
    color: colors.text,
  },
});
