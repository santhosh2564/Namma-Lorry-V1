import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native";

import { Banner, Screen } from "@/components/ui";
import { useAuthStore } from "@/features/auth/store";
import { HistoryFilters, HistoryList } from "@/features/trips/HistoryList";
import type { HistoryFilter } from "@/features/trips/historyState";
import { useDriverHistory } from "@/features/trips/useDriverTrips";
import { spacing } from "@/theme/tokens";

/**
 * D7 Trip History (M11, docs/12 D7).
 *
 * "Horizontal filter chips: All, Verified, Under review, Not verified · Summary
 * strip · Vertical list of trip rows grouped by month header."
 *
 * Every row is this driver's own (RLS scopes the read, and the query is keyed
 * by their id), and a row opens D6 — the same result screen they saw the moment
 * they ended the trip, which is the one they want when a load pays on verified
 * kilometres.
 *
 * `assigned` trips are not history: they are on D3, waiting to be driven.
 */
export default function TripHistoryScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const userId = useAuthStore((state) => state.userId);
  const [filter, setFilter] = useState<HistoryFilter>("all");

  const history = useDriverHistory(userId);
  const rows = history.data ?? [];

  return (
    <Screen scroll style={styles.screen} testID="history-screen">
      <HistoryFilters filter={filter} onChange={setFilter} />

      {history.isError ? (
        <Banner
          actionLabel={t("common.retry")}
          message={t("driver.history.loadFailed")}
          onAction={() => void history.refetch()}
          variant="error"
        />
      ) : null}

      <HistoryList
        filter={filter}
        onOpen={(tripId) => router.push(`/(driver)/trips/${tripId}/summary` as never)}
        rows={rows}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.sm },
});
