import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import type { LatLng } from "@/components/map/types";
import { Banner, Button, Card, SectionHeader, StatBlock } from "@/components/ui";
import { destinationPoint } from "@/lib/geo";
import { colors, fonts, fontSize, spacing } from "@/theme/tokens";
import { HEARTBEAT_MS, MIN_MOVE_M, TRACKING_OPTIONS } from "@/tracking/config";
import { getTrackingStore } from "@/tracking/db";
import {
  selectPoints,
  type PointCounts,
  type PointInput,
  type TripStateRow,
} from "@/tracking/queue";
import { endTrip, flushPoints, resetTrackingSingletons } from "@/tracking/service";

/**
 * Dev-only tracking console (M8).
 *
 * Shows exactly what the background task writes — persisted state, queue counts,
 * the last fix — and can simulate fixes so the ND-6 throttle and the uploader can
 * be exercised without a device. On web it runs against the in-memory store
 * (TRD §4.4: a browser never runs a real trip), on a device against the real
 * SQLite queue.
 *
 * The simulator deliberately runs the *same* `selectPoints` gate the task uses,
 * so what it shows here is the rule the phone applies, not a second guess.
 */

/** A syntactically valid trip id so the UI can stand in for a real `trips` row. */
const SAMPLE_TRIP_ID = "11111111-1111-4111-8111-111111111111";

/** Registers the demo trip path: Sriperumbudur SIPCOT (stitch/DESIGN.md). */
const START_POINT: LatLng = { lat: 12.9698, lng: 79.9382 };

type Snapshot = {
  state: TripStateRow;
  counts: PointCounts;
  last: {
    seq: number;
    recordedAt: string;
    lat: number;
    lng: number;
    accuracyM: number | null;
    isMocked: boolean;
  } | null;
};

const ZERO_COUNTS: PointCounts = { total: 0, pending: 0, uploaded: 0, quarantined: 0 };

export default function DevTracking() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reading is separate from rendering: the effect subscribes to the store by
  // loading a snapshot, and only the callback sets state.
  const loadSnapshot = useCallback(async (): Promise<Snapshot> => {
    const store = await getTrackingStore();
    const state = await store.readState();
    const counts = state.tripId === null ? ZERO_COUNTS : await store.countPoints(state.tripId);
    const last = state.tripId === null ? null : await store.lastPoint(state.tripId);
    return { state, counts, last };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadSnapshot().then((next) => {
      if (!cancelled) {
        setSnapshot(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loadSnapshot]);

  const run = useCallback(
    async (label: string, action: () => Promise<string | null>) => {
      setBusy(true);
      setMessage(null);
      try {
        const result = await action();
        if (result !== null) {
          setMessage(`${label}: ${result}`);
        }
      } catch (error) {
        setMessage(`${label} failed: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setSnapshot(await loadSnapshot());
        setBusy(false);
      }
    },
    [loadSnapshot],
  );

  const startSimulatedTrip = useCallback(
    () =>
      run("Simulate trip", async () => {
        const store = await getTrackingStore();
        await store.writeState({
          tripId: SAMPLE_TRIP_ID,
          state: "TRACKING",
          nextSeq: 0,
          startedAt: new Date().toISOString(),
          endedAt: null,
          endLat: null,
          endLng: null,
          endAccuracy: null,
        });
        return `TRACKING ${SAMPLE_TRIP_ID.slice(0, 8)}…`;
      }),
    [run],
  );

  const simulate = useCallback(
    (kind: "moving" | "parked") =>
      run(kind === "moving" ? "Simulate moving" : "Simulate parked", async () => {
        const store = await getTrackingStore();
        const state = await store.readState();
        if (state.tripId === null) {
          return "no active trip";
        }
        const last = await store.lastPoint(state.tripId);
        const base: LatLng = last === null ? START_POINT : { lat: last.lat, lng: last.lng };
        const baseTime = last === null ? Date.now() : Date.parse(last.recordedAt);

        // Six fixes: moving = ~30 m apart every 10 s; parked = 1 m apart every
        // 10 s, which the throttle must collapse to (almost) nothing.
        const fixes: PointInput[] = [];
        for (let index = 1; index <= 6; index += 1) {
          const distanceM = kind === "moving" ? 30 * index : 1;
          const position = destinationPoint(base, distanceM, 45);
          fixes.push({
            recordedAt: new Date(baseTime + index * 10_000).toISOString(),
            lat: position.lat,
            lng: position.lng,
            accuracyM: 8,
            speedMps: kind === "moving" ? 3 : 0,
            heading: 45,
            altitudeM: null,
            isMocked: true,
          });
        }

        const previous =
          last === null ? null : { lat: last.lat, lng: last.lng, recordedAt: last.recordedAt };
        const accepted = selectPoints(previous, fixes, {
          minMoveM: MIN_MOVE_M,
          heartbeatMs: HEARTBEAT_MS,
        });
        const written = await store.insertPoints(state.tripId, accepted);
        return `${written} of ${fixes.length} fixes kept`;
      }),
    [run],
  );

  const flush = useCallback(
    () =>
      run("Flush", async () => {
        const result = await flushPoints();
        return `uploaded ${result.uploaded}, quarantined ${result.quarantined}${
          result.network ? " (offline)" : ""
        }`;
      }),
    [run],
  );

  const end = useCallback(
    () =>
      run("End trip", async () => {
        const result = await endTrip();
        return result.kind;
      }),
    [run],
  );

  const clear = useCallback(
    () =>
      run("Clear", async () => {
        resetTrackingSingletons();
        return "queue and state cleared";
      }),
    [run],
  );

  const state = snapshot?.state;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>Tracking engine</Text>
        <Text style={styles.pageHint}>
          M8 · store, queue, uploader, state machine · no network in the task
        </Text>
      </View>

      {message !== null ? <Banner message={message} variant="info" /> : null}

      <Card>
        <SectionHeader title="State" />
        <View style={styles.stats}>
          <StatBlock label="State" size="sm" value={state?.state ?? "…"} />
          <StatBlock label="Next seq" size="sm" value={String(state?.nextSeq ?? 0)} />
        </View>
        <Text style={styles.mono}>trip {state?.tripId ?? "—"}</Text>
        <Text style={styles.mono}>started {state?.startedAt ?? "—"}</Text>
        <Text style={styles.mono}>ended {state?.endedAt ?? "—"}</Text>
      </Card>

      <Card>
        <SectionHeader title="Queue" />
        <View style={styles.stats}>
          <StatBlock label="Total" size="sm" value={String(snapshot?.counts.total ?? 0)} />
          <StatBlock label="Pending" size="sm" value={String(snapshot?.counts.pending ?? 0)} />
          <StatBlock label="Uploaded" size="sm" value={String(snapshot?.counts.uploaded ?? 0)} />
          <StatBlock
            label="Quarantined"
            size="sm"
            value={String(snapshot?.counts.quarantined ?? 0)}
          />
        </View>
      </Card>

      <Card>
        <SectionHeader title="Last point" />
        {snapshot?.last ? (
          <>
            <Text style={styles.mono}>seq {snapshot.last.seq}</Text>
            <Text style={styles.mono}>
              {snapshot.last.lat.toFixed(5)}, {snapshot.last.lng.toFixed(5)}
            </Text>
            <Text style={styles.mono}>
              acc {snapshot.last.accuracyM ?? "—"} m · mocked {String(snapshot.last.isMocked)}
            </Text>
            <Text style={styles.mono}>{snapshot.last.recordedAt}</Text>
          </>
        ) : (
          <Text style={styles.hint}>No points yet — start a simulated trip first.</Text>
        )}
      </Card>

      <Card>
        <SectionHeader title="Rules in force (ND-6)" />
        <Text style={styles.mono}>
          timeInterval {TRACKING_OPTIONS.timeInterval} ms · distanceInterval{" "}
          {TRACKING_OPTIONS.distanceInterval} m
        </Text>
        <Text style={styles.mono}>
          keep a point per {MIN_MOVE_M} m moved, or per {HEARTBEAT_MS / 60_000} min parked
        </Text>
      </Card>

      <View style={styles.actions}>
        <Button
          disabled={busy}
          fullWidth
          label="Start simulated trip"
          onPress={() => void startSimulatedTrip()}
        />
        <Button
          disabled={busy}
          fullWidth
          label="Simulate 6 moving fixes"
          onPress={() => void simulate("moving")}
          variant="outline"
        />
        <Button
          disabled={busy}
          fullWidth
          label="Simulate 6 parked fixes (throttled)"
          onPress={() => void simulate("parked")}
          variant="outline"
        />
        <Button
          disabled={busy}
          fullWidth
          label="Flush now"
          onPress={() => void flush()}
          variant="outline"
        />
        <Button
          disabled={busy}
          fullWidth
          label="End trip"
          onPress={() => void end()}
          variant="danger"
        />
        <Button
          disabled={busy}
          fullWidth
          label="Clear queue and state"
          onPress={() => void clear()}
          variant="text"
        />
      </View>

      <Text style={styles.hint}>
        Mobile only: the real background task needs a development build (Mappls + expo-location). On
        web this screen runs against the in-memory store.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    padding: spacing.md,
    gap: spacing.lg,
    maxWidth: 900,
    width: "100%",
    alignSelf: "center",
  },
  header: { gap: spacing.xs },
  pageTitle: { fontFamily: fonts.semibold, fontSize: fontSize.heading, color: colors.text },
  pageHint: { fontFamily: fonts.regular, fontSize: fontSize.caption, color: colors.textSecondary },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xl, marginBottom: spacing.sm },
  mono: {
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
  hint: { fontFamily: fonts.regular, fontSize: fontSize.caption, color: colors.textSecondary },
  actions: { gap: spacing.sm },
});
