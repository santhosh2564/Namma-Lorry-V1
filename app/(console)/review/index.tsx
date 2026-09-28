import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Banner, EmptyState } from "@/components/ui";
import { ReviewCard } from "@/features/console/ReviewCard";
import { useReviewQueue } from "@/features/console/useConsoleTrip";
import { colors, fonts, fontSize, spacing } from "@/theme/tokens";

/**
 * C7 Review Queue (M11, docs/12 C7).
 *
 * "Title 'Trips to review (3)' with oldest-first sort. Card list, each card:
 * Load ID, driver, vehicle, ended '2 h ago', route, orange reason chips with
 * plain text, mini map thumbnail, button 'Open & review'. Empty state variant
 * text 'All caught up'."
 *
 * The queue is a shared, real-time work surface: the ordering and the count both
 * come from the server, and a decision made by one operator invalidates the
 * board for the others rather than leaving a stale card that refuses to open
 * (`TRIP_NOT_IN_REVIEW`).
 */
export default function ReviewQueueScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const queue = useReviewQueue();

  // "Ended 2 h ago" has to keep moving while the queue sits open.
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const rows = queue.data ?? [];
  const open = (tripId: string) => router.push(`/(console)/trips/${tripId}` as never);

  return (
    <View style={styles.screen} testID="review-queue-screen">
      <View style={styles.header}>
        <Text style={styles.heading} testID="review-queue-title">
          {t("console.review.title", { count: rows.length })}
        </Text>
        <Text style={styles.subheading}>{t("console.review.subtitle")}</Text>
      </View>

      {queue.isError ? (
        <Banner
          actionLabel={t("common.retry")}
          message={t("console.review.loadFailed")}
          onAction={() => void queue.refetch()}
          variant="error"
        />
      ) : null}

      {queue.isSuccess && rows.length === 0 ? (
        <EmptyState
          action={<Banner message={t("console.review.emptyHint")} variant="success" />}
          icon="task_alt"
          testID="review-queue-empty"
          title={t("console.review.emptyTitle")}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list} testID="review-queue-list">
          {rows.map((row) => (
            <ReviewCard key={row.id} nowMs={nowMs} onOpen={open} row={row} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: spacing.md, padding: spacing.lg },
  header: { gap: 2 },
  heading: { fontFamily: fonts.semibold, fontSize: fontSize.title, color: colors.text },
  subheading: {
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
  list: { gap: spacing.md, paddingBottom: spacing.lg },
});
