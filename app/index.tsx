import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Banner, Button } from "@/components/ui";
import { currentPlatform } from "@/features/auth/platform";
import { decideRoute, routePath } from "@/features/auth/routing";
import { useAuthStore } from "@/features/auth/store";
import { useProfile } from "@/features/auth/useProfile";
import { CONSENT_VERSION } from "@/features/onboarding/consent";
import { colors, fonts, fontSize, radii, spacing } from "@/theme/tokens";

/**
 * S1 Splash (docs/12): brand, then decide where to go (docs/04 §2).
 *
 * The local tracking state is checked first — an unfinished trip is resumed
 * before the session and role gate runs. From there `decideRoute` is the only
 * thing that decides the destination, so the whole flow is covered by the unit
 * tests in `routing.test.ts` rather than by this component.
 */
export default function SplashScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const status = useAuthStore((state) => state.status);
  const activeTripId = useAuthStore((state) => state.activeTripId);
  const profileQuery = useProfile();

  const decision = decideRoute({
    session: status,
    // Web never runs trips (TRD §4.4); the gate only distinguishes it from the
    // two native platforms.
    platform: currentPlatform(),
    profile: profileQuery.data ?? null,
    profileSettled: profileQuery.isFetched,
    activeTripId,
    consentVersion: CONSENT_VERSION,
  });

  // `decideRoute` returns a fresh object each render, so the decision is
  // serialised into a key to navigate once per outcome instead of on every
  // render.
  const decisionKey = JSON.stringify(decision);
  const navigatedTo = useRef<string | null>(null);

  useEffect(() => {
    if (decision.destination === "splash" || navigatedTo.current === decisionKey) {
      return;
    }
    navigatedTo.current = decisionKey;
    router.replace(routePath(decision));
  }, [decision, decisionKey, router]);

  // The profile query can only fail once there is a session, and only the
  // signed-in path waits on it, so a failure is safe to surface here.
  const gateFailed = profileQuery.isError && profileQuery.isFetched;

  return (
    <SafeAreaView style={styles.safe} testID="splash-screen">
      <View style={styles.container}>
        <View style={styles.logoBox}>
          <Text style={styles.logoText}>NL</Text>
        </View>
        <Text style={styles.wordmark}>{t("common.appName")}</Text>
        <Text style={styles.tagline}>{t("common.tagline")}</Text>

        {gateFailed ? (
          <View style={styles.retry}>
            <Banner message={t("splash.gateFailed")} variant="offline" />
            <Button
              fullWidth
              label={t("common.retry")}
              onPress={() => void profileQuery.refetch()}
              size="lg"
              variant="outline"
            />
          </View>
        ) : (
          <>
            <ActivityIndicator
              color={colors.accent}
              style={styles.spinner}
              testID="splash-spinner"
            />
            <Text style={styles.status}>
              {activeTripId !== null ? t("splash.restoringTrip") : t("splash.checkingSession")}
            </Text>
          </>
        )}

        <Text style={styles.version}>v1.0</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.primary },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.lg,
  },
  logoBox: {
    width: 72,
    height: 72,
    borderRadius: radii.card,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  logoText: { color: colors.primary, fontSize: 28, fontFamily: fonts.bold },
  wordmark: { color: colors.textInverse, fontSize: 24, fontFamily: fonts.semibold },
  tagline: { color: colors.textInverseMuted, fontSize: fontSize.body },
  spinner: { marginTop: spacing.xl },
  status: {
    color: colors.textInverseSubtle,
    fontSize: fontSize.caption,
    fontFamily: fonts.medium,
  },
  retry: { alignSelf: "stretch", gap: spacing.md, marginTop: spacing.xl },
  version: { color: colors.textInverseSubtle, fontSize: fontSize.caption, marginTop: spacing.xl },
});
