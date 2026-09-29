import * as Linking from "expo-linking";
import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppState, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Banner, Button, Card, Icon } from "@/components/ui";
import { useAuthStore } from "@/features/auth/store";
import { recordConsent } from "@/features/onboarding/consent";
import {
  nextPendingRow,
  permissionsComplete,
  permissionsLost,
  readPermissionSnapshot,
  requestPermissionRow,
  type PermissionRowName,
  type PermissionRowState,
  type PermissionSnapshot,
} from "@/features/onboarding/permissions";
import { colors, fonts, fontSize, spacing } from "@/theme/tokens";

/**
 * D1 Location Permission (docs/12 D1, docs/09 §1–§3).
 *
 * The prominent disclosure card is the first thing on screen and nothing here
 * requests a permission until it has rendered — Google Play's
 * background-location policy requires the disclosure before the system dialog
 * (docs/09 §2), and "Continue" is what timestamps that consent through
 * `record_consent` (docs/09 §1, migration 0002).
 *
 * Rows are requested strictly in order (foreground → background →
 * notifications): Android 10+ only offers "Allow all the time" once foreground
 * is granted, so a background-first dialog could never succeed. A permanently
 * denied row swaps its Allow button for "Open settings" — re-asking a blocked
 * permission only resolves to denied again.
 *
 * Permissions are re-read on every foreground (docs/12 D1: "permission later
 * revoked"); the launch gate sends a driver whose background grant vanished
 * back here before D3 renders.
 */
const ROWS: PermissionRowName[] = ["foreground", "background", "notifications"];

const ROW_META: Record<PermissionRowName, { icon: string; labelKey: string; blockedKey: string }> =
  {
    foreground: { icon: "my_location", labelKey: "rowForeground", blockedKey: "blockedForeground" },
    background: {
      icon: "travel_explore",
      labelKey: "rowBackground",
      blockedKey: "blockedBackground",
    },
    notifications: {
      icon: "notifications",
      labelKey: "rowNotifications",
      blockedKey: "blockedNotifications",
    },
  };

const DISCLOSURE: [string, string][] = [
  ["onlyDuringTrips", "route"],
  ["verifiedExperience", "verified"],
  ["sharedWithOps", "groups"],
];

export default function PermissionsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<PermissionSnapshot | null>(null);
  const [busyRow, setBusyRow] = useState<PermissionRowName | null>(null);
  const [continuing, setContinuing] = useState(false);
  const [consentError, setConsentError] = useState(false);

  const refresh = useCallback(() => {
    void readPermissionSnapshot().then((next) => {
      setSnapshot(next);
      // Keep the launch gate's view in sync, so a later foreground re-check
      // (or a trip start) sees the same truth this screen shows.
      useAuthStore.getState().setPermissionsGranted(!permissionsLost(next));
    });
  }, []);

  // First read, then re-read on every return to the foreground: the OS can
  // change a grant while the app is closed or in settings.
  useEffect(() => {
    refresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refresh();
      }
    });
    return () => subscription.remove();
  }, [refresh]);

  const rowTapped = useCallback(async (row: PermissionRowName) => {
    setBusyRow(row);
    try {
      setSnapshot(await requestPermissionRow(row));
    } finally {
      setBusyRow(null);
    }
  }, []);

  const openSystemSettings = useCallback(() => {
    if (Platform.OS !== "web") {
      void Linking.openSettings();
    }
  }, []);

  const continueTapped = useCallback(async () => {
    setContinuing(true);
    setConsentError(false);
    try {
      // Record who agreed to what, when (docs/09 §1). Failure blocks the flow:
      // an unrecorded consent must not let a driver sail into tracking.
      // recordConsent reports failure by returning { ok: false }, not throwing.
      const result = await recordConsent();
      if (!result.ok) {
        setConsentError(true);
        return;
      }
      router.replace("/(onboarding)/battery");
    } catch {
      setConsentError(true);
    } finally {
      setContinuing(false);
    }
  }, [router]);

  if (Platform.OS === "web") {
    return <WebNote />;
  }

  const complete = snapshot !== null && permissionsComplete(snapshot);
  const pending = snapshot === null ? null : nextPendingRow(snapshot);

  return (
    <SafeAreaView style={styles.safe} testID="onboarding-permissions-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.step}>{t("onboarding.permissions.step")}</Text>
        <Text style={styles.title}>{t("onboarding.permissions.title")}</Text>
        <Text style={styles.subtitle}>{t("onboarding.permissions.subtitle")}</Text>

        <Card style={styles.disclosure} testID="onboarding-disclosure">
          {DISCLOSURE.map(([key, icon]) => (
            <View key={key} style={styles.disclosureRow}>
              <Icon name={icon} size={20} color={colors.primary} />
              <Text style={styles.disclosureText}>
                {t(`onboarding.permissions.disclosure.${key}`)}
              </Text>
            </View>
          ))}
        </Card>

        <View style={styles.rows}>
          {ROWS.map((row) => (
            <PermissionRow
              key={row}
              name={row}
              onAllow={() => void rowTapped(row)}
              onOpenSettings={openSystemSettings}
              busy={busyRow === row}
              state={snapshot === null ? null : snapshot[row]}
            />
          ))}
        </View>

        {consentError ? (
          <Banner
            message={t("onboarding.permissions.consentFailed")}
            onDismiss={() => setConsentError(false)}
            testID="onboarding-consent-error"
            variant="error"
          />
        ) : null}

        <Button
          disabled={!complete || continuing}
          fullWidth
          label={t("onboarding.permissions.continue")}
          loading={continuing}
          onPress={() => void continueTapped()}
          size="driver"
          testID="onboarding-continue"
        />
        {pending !== null ? (
          <Text style={styles.hint}>{t("onboarding.permissions.pendingHint")}</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/** One checklist row: icon + name, then status / Allow / Open settings. */
function PermissionRow({
  name,
  state,
  busy,
  onAllow,
  onOpenSettings,
}: {
  name: PermissionRowName;
  state: PermissionRowState | null;
  busy: boolean;
  onAllow: () => void;
  onOpenSettings: () => void;
}) {
  const { t } = useTranslation();
  const meta = ROW_META[name];

  if (state === null) {
    return (
      <Card style={styles.rowCard}>
        <Icon name={meta.icon} size={20} color={colors.textSecondary} />
        <Text style={styles.rowLabel}>{t(`onboarding.permissions.${meta.labelKey}`)}</Text>
        <Text style={styles.rowState}>{t("common.loading")}</Text>
      </Card>
    );
  }

  if (state === "granted") {
    return (
      <Card style={styles.rowCard} testID={`onboarding-row-${name}`}>
        <Icon name={meta.icon} size={20} color={colors.primary} />
        <Text style={styles.rowLabel}>{t(`onboarding.permissions.${meta.labelKey}`)}</Text>
        <Icon
          accessibilityLabel={t("onboarding.permissions.allowedA11y")}
          name="check_circle"
          size={20}
          color={colors.verified}
        />
      </Card>
    );
  }

  if (state === "blocked") {
    return (
      <View testID={`onboarding-row-${name}`}>
        <Card style={styles.rowCard}>
          <Icon name={meta.icon} size={20} color={colors.rejected} />
          <Text style={styles.rowLabel}>{t(`onboarding.permissions.${meta.labelKey}`)}</Text>
          <Button
            label={t("onboarding.permissions.openSettings")}
            onPress={onOpenSettings}
            size="sm"
            testID={`onboarding-open-settings-${name}`}
            variant="outline"
          />
        </Card>
        <Banner
          message={t(`onboarding.permissions.${meta.blockedKey}`)}
          onAction={onOpenSettings}
          actionLabel={t("onboarding.permissions.openSettings")}
          testID={`onboarding-blocked-${name}`}
          variant="warning"
        />
      </View>
    );
  }

  // requestable
  return (
    <Card style={styles.rowCard} testID={`onboarding-row-${name}`}>
      <Icon name={meta.icon} size={20} color={colors.textSecondary} />
      <Text style={styles.rowLabel}>{t(`onboarding.permissions.${meta.labelKey}`)}</Text>
      <Button
        label={t("onboarding.permissions.allow")}
        loading={busy}
        onPress={onAllow}
        size="sm"
        testID={`onboarding-allow-${name}`}
      />
    </Card>
  );
}

const webStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.lg,
  },
  title: { fontFamily: fonts.semibold, fontSize: fontSize.subtitle, color: colors.text },
  body: {
    fontFamily: fonts.regular,
    fontSize: fontSize.body,
    color: colors.textSecondary,
    textAlign: "center",
    maxWidth: 320,
  },
});

/** Drivers do not use web (TRD §4.4) — a short explanation instead of the flow. */
function WebNote() {
  const { t } = useTranslation();
  return (
    <SafeAreaView style={webStyles.safe}>
      <View style={webStyles.container}>
        <Text style={webStyles.title}>{t("onboarding.permissions.title")}</Text>
        <Text style={webStyles.body}>{t("onboarding.permissions.webNote")}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  step: { fontFamily: fonts.medium, fontSize: fontSize.caption, color: colors.textSecondary },
  title: { fontFamily: fonts.semibold, fontSize: fontSize.subtitle, color: colors.text },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.body, color: colors.textSecondary },
  disclosure: { gap: spacing.sm, backgroundColor: colors.primaryMuted },
  disclosureRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  disclosureText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.text,
  },
  rows: { gap: spacing.sm },
  rowCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowLabel: { flex: 1, fontFamily: fonts.medium, fontSize: fontSize.body, color: colors.text },
  rowState: { fontFamily: fonts.regular, fontSize: fontSize.caption, color: colors.textSecondary },
  hint: {
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    textAlign: "center",
  },
});
