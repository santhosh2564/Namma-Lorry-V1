/**
 * C6 event timeline (M11, docs/12 C6).
 *
 * "Started 06:10, Ended 15:52, Flagged 15:53" — the audit trail from
 * `trip_events`, oldest first, which is the same trail a DPDP question about
 * this trip would be answered from. Each entry is a documented event type
 * (`started`, `ended`, `verified`, `needs_review`, `approved`, `rejected`,
 * `assigned`), rendered with the actor when the database recorded one.
 *
 * Unknown event types are still shown: a new server-side event must not make a
 * reviewer think the trip has no history.
 */
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card, Icon, SectionHeader } from "@/components/ui";
import { replayClock } from "@/features/console/replayState";
import type { TripEvent } from "@/features/console/useConsoleTrip";
import { colors, fonts, fontSize, spacing } from "@/theme/tokens";

export type EventTimelineProps = {
  events: TripEvent[];
  /** Tapping an entry scrubs the replay to that moment. */
  onSeekTo: (iso: string) => void;
};

/** The event types `0001` writes (verified_trip, admin_review_trip, the RPCs). */
const KNOWN_EVENT_TYPES = [
  "assigned",
  "started",
  "ended",
  "verified",
  "needs_review",
  "approved",
  "rejected",
] as const;

/**
 * Pure: event type → translation key.
 *
 * A type this build has never heard of falls back to a neutral label rather
 * than rendering a raw key, so a Phase 2 event still shows a row in the
 * timeline with its timestamp and actor.
 */
export function eventLabelKey(type: string): string {
  return (KNOWN_EVENT_TYPES as readonly string[]).includes(type)
    ? `console.trip.events.${type}`
    : "console.trip.events.unknown";
}

export function EventTimeline({ events, onSeekTo }: EventTimelineProps) {
  const { t } = useTranslation();

  return (
    <Card testID="event-timeline">
      <SectionHeader title={t("console.trip.timeline")} />
      {events.length === 0 ? (
        <Text style={styles.empty}>{t("console.trip.timelineEmpty")}</Text>
      ) : (
        <View style={styles.list}>
          {events.map((event) => (
            <Pressable
              accessibilityRole="button"
              key={event.id}
              onPress={() => onSeekTo(event.createdAt)}
              style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
              testID={`event-${event.id}`}
            >
              <Icon name="fiber_manual_record" size={12} color={colors.accent} />
              <Text style={styles.type}>{t(eventLabelKey(event.type))}</Text>
              <Text style={styles.clock}>{replayClock(event.createdAt) ?? "—"}</Text>
              {event.actorName === null ? null : (
                <Text style={styles.actor}>{event.actorName}</Text>
              )}
            </Pressable>
          ))}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  empty: { fontFamily: fonts.regular, fontSize: fontSize.caption, color: colors.textSecondary },
  list: { gap: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  pressed: { backgroundColor: colors.surfaceAlt },
  type: { fontFamily: fonts.medium, fontSize: fontSize.caption, color: colors.text },
  clock: {
    fontFamily: fonts.medium,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    fontVariant: ["tabular-nums"],
  },
  actor: {
    marginLeft: "auto",
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
});
