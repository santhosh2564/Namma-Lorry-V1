/**
 * C6 replay control (M11, docs/12 C6).
 *
 * A play/pause button and a slider over the recorded points, with the time at
 * the cursor and the trip's total duration on either side. The slider is a
 * plain press-to-scrub track rather than a drag gesture on purpose: it needs no
 * native module (the console is a web build as much as a native one), it is
 * usable with a keyboard and a screen reader, and every position it can reach is
 * a point that actually exists in `trip_points`.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { LayoutChangeEvent } from "react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui";
import { replayProgress, type ReplayState } from "@/features/console/replayState";
import { colors, fonts, fontSize, radii, spacing, touch } from "@/theme/tokens";

export type ReplayBarProps = {
  state: ReplayState;
  pointCount: number;
  /** "06:10" at the cursor, and "15:52" at the end. */
  clockLabel: string | null;
  totalLabel: string | null;
  canReplay: boolean;
  onToggle: () => void;
  onSeek: (index: number) => void;
};

export function ReplayBar({
  state,
  pointCount,
  clockLabel,
  totalLabel,
  canReplay,
  onToggle,
  onSeek,
}: ReplayBarProps) {
  const { t } = useTranslation();
  const [width, setWidth] = useState(0);
  const progress = replayProgress(state, pointCount);

  const onLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  // A press anywhere on the track jumps to the nearest recorded point.
  const onTrackPress = (locationX: number) => {
    if (width <= 0 || pointCount < 2) {
      return;
    }
    const ratio = Math.max(0, Math.min(1, locationX / width));
    onSeek(Math.round(ratio * (pointCount - 1)));
  };

  return (
    <View style={styles.container} testID="replay-bar">
      <View style={styles.controls}>
        <Button
          icon={state.playing ? "pause" : "play_arrow"}
          label={state.playing ? t("console.trip.replayPause") : t("console.trip.replayPlay")}
          onPress={onToggle}
          size="sm"
          testID="replay-toggle"
          variant={state.playing ? "secondary" : "primary"}
        />
        <View style={styles.clock}>
          <Text style={styles.clockValue} testID="replay-clock">
            {clockLabel ?? "—"}
          </Text>
          {totalLabel === null ? null : <Text style={styles.clockTotal}>{totalLabel}</Text>}
        </View>
      </View>

      <Pressable
        accessibilityLabel={t("console.trip.replaySlider")}
        accessibilityRole="adjustable"
        disabled={!canReplay}
        onLayout={onLayout}
        onPress={(event) => onTrackPress(event.nativeEvent.locationX)}
        style={styles.track}
        testID="replay-track"
      >
        <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
        <View
          style={[
            styles.thumb,
            { left: `${Math.round(progress * 100)}%` },
            canReplay ? null : styles.thumbDisabled,
          ]}
        />
      </Pressable>

      <Text style={styles.caption}>
        {canReplay
          ? t("console.trip.replayPoints", { count: pointCount })
          : t("console.trip.replayUnavailable")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  controls: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  clock: { flexDirection: "row", alignItems: "baseline", gap: spacing.xs },
  clockValue: {
    fontFamily: fonts.bold,
    fontSize: fontSize.subtitle,
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  clockTotal: {
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
  track: {
    height: touch.min - 20,
    justifyContent: "center",
    borderRadius: radii.chip,
    backgroundColor: colors.border,
  },
  fill: { height: 6, borderRadius: radii.chip, backgroundColor: colors.primary },
  thumb: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 10,
    marginLeft: -10,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  thumbDisabled: { backgroundColor: colors.textDisabled },
  caption: { fontFamily: fonts.regular, fontSize: fontSize.caption, color: colors.textSecondary },
});
