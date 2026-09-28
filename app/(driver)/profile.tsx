import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";

import { Banner, BottomSheet, Card, ListRow, Screen, SectionHeader } from "@/components/ui";
import { signOut } from "@/features/auth/api";
import { AuthError } from "@/features/auth/errors";
import { useAuthStore } from "@/features/auth/store";
import { deviceHealth, signOutBlockedBy } from "@/features/driver/health";
import { LanguageSheet } from "@/features/driver/LanguageSheet";
import { initialsOf, maskPhone, monthYearLabel } from "@/features/driver/profileState";
import { ProfileStatsCard } from "@/features/driver/ProfileStatsCard";
import { useOwnProfile } from "@/features/driver/useOwnProfile";
import { isBatterySetupNeeded } from "@/features/onboarding/battery";
import {
  isPermissionFlowSupported,
  readPermissionSnapshot,
  type PermissionSnapshot,
} from "@/features/onboarding/permissions";
import { useDriverStatsDetail } from "@/features/trips/useDriverTrips";
import { defaultLanguage, supportedLanguages, type Language } from "@/i18n";
import { SCREENS } from "@/lib/screens";
import { colors, fonts, fontSize, radii, spacing } from "@/theme/tokens";

/**
 * D8 My Profile (M11, docs/12 D8).
 *
 * "Header card on Ink Navy: initials avatar, name, phone, 'Driver since …'
 * chip. Below, a white card titled 'Verified experience' with a lock icon and
 * caption 'Calculated by Namma Lorry from GPS — can't be edited': 3 big stats.
 * Settings list: Language, Location & battery check, Privacy policy, Help &
 * support, Sign out."
 *
 * Three decisions worth stating:
 * - **The phone is masked** (`profileState.maskPhone`). It is shown in full on
 *   the dispatch screen, where the people who need it are; not on the driver's
 *   own locked phone.
 * - **The privacy policy is shown in-app**, from the same docs/09 disclosure
 *   copy D1 uses, rather than linking to a URL that does not exist yet — a
 *   published policy URL is release work (M12c), and a link to nothing is worse
 *   than the text itself.
 * - **Sign-out is blocked during an active trip** (`signOutBlockedBy`).
 *   Signing out stops the background location task, which would end the trip's
 *   record mid-drive; the row says so and points at ending the trip instead.
 */
export default function ProfileScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();

  const userId = useAuthStore((state) => state.userId);
  const activeTripId = useAuthStore((state) => state.activeTripId);

  const profile = useOwnProfile();
  const stats = useDriverStatsDetail(userId);

  const [snapshot, setSnapshot] = useState<PermissionSnapshot | null>(null);
  const [languageSheet, setLanguageSheet] = useState(false);
  const [privacySheet, setPrivacySheet] = useState(false);
  const [signOutError, setSignOutError] = useState(false);

  // The health check reads the same permissions D1 works with, on every
  // foreground — a grant can be revoked from Settings while the app is open.
  useEffect(() => {
    let active = true;
    const read = () => {
      void readPermissionSnapshot().then((next) => {
        if (active) {
          setSnapshot(next);
        }
      });
    };
    read();
    return () => {
      active = false;
    };
  }, []);

  const health = deviceHealth({
    snapshot,
    permissionFlowSupported: isPermissionFlowSupported(),
    batterySetupNeeded: isBatterySetupNeeded(),
  });
  const blocked = signOutBlockedBy(activeTripId);

  const onSignOut = useCallback(async () => {
    if (blocked) {
      return;
    }
    setSignOutError(false);
    try {
      await signOut();
      router.replace(SCREENS.S1.route);
    } catch (error) {
      if (!(error instanceof AuthError)) {
        console.error(error);
      }
      setSignOutError(true);
    }
  }, [blocked, router]);

  const driverSince = monthYearLabel(profile.data?.createdAt ?? null);

  // A browser or a stored preference can be set to a language the app does not
  // ship; the row then shows the default rather than a raw code.
  const currentLanguage: Language = (supportedLanguages as readonly string[]).includes(
    i18n.language,
  )
    ? (i18n.language as Language)
    : defaultLanguage;

  return (
    <Screen scroll style={styles.screen} testID="profile-screen">
      <View style={styles.header} testID="profile-header">
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initialsOf(profile.data?.fullName)}</Text>
        </View>
        <View style={styles.headerTexts}>
          <Text style={styles.name} testID="profile-name">
            {profile.data?.fullName || t("driver.trips.driverFallback")}
          </Text>
          <Text style={styles.phone}>{maskPhone(profile.data?.phone)}</Text>
          {driverSince === null ? null : (
            <Text style={styles.since} testID="profile-since">
              {t("driver.profile.driverSince", { month: driverSince })}
            </Text>
          )}
        </View>
      </View>

      {profile.isError ? <Banner message={t("driver.profile.loadFailed")} variant="error" /> : null}

      <ProfileStatsCard
        lastVerifiedAt={stats.data?.last_verified_at ?? null}
        verifiedKm={
          stats.data === undefined || stats.data === null
            ? null
            : Math.round(Number(stats.data.verified_distance_m) / 1000)
        }
        verifiedTrips={stats.data?.verified_trips ?? null}
      />

      <Card padded={false} testID="profile-settings">
        <SectionHeader title={t("driver.profile.settings")} />
        <ListRow
          icon="translate"
          onPress={() => setLanguageSheet(true)}
          testID="profile-language"
          title={t("driver.profile.language")}
          value={t(`language.${currentLanguage}`)}
        />
        <ListRow
          icon="health_and_safety"
          testID="profile-health"
          title={t("driver.profile.health.label")}
          value={t(health.labelKey)}
          valueColor={health.allGood ? colors.verified : colors.review}
        />
        {health.allGood ? null : (
          <Text style={styles.healthHint} testID="profile-health-hint">
            {t("driver.profile.healthHint")}
          </Text>
        )}
        <ListRow
          icon="policy"
          onPress={() => setPrivacySheet(true)}
          testID="profile-privacy"
          title={t("driver.profile.privacy")}
        />
        <ListRow
          icon="help"
          onPress={() => router.push("/access-notice" as never)}
          testID="profile-help"
          title={t("driver.profile.help")}
        />
        <ListRow
          disabled={blocked}
          icon="logout"
          iconColor={colors.rejected}
          onPress={() => void onSignOut()}
          testID="profile-sign-out"
          title={t("driver.profile.signOut")}
          value={blocked ? t("driver.profile.signOutBlocked") : undefined}
          valueColor={colors.rejected}
        />
      </Card>

      {blocked ? (
        <Banner
          message={t("driver.profile.signOutBlockedHint")}
          testID="profile-sign-out-blocked"
          variant="warning"
        />
      ) : null}
      {signOutError ? <Banner message={t("driver.profile.signOutFailed")} variant="error" /> : null}

      <LanguageSheet
        current={currentLanguage}
        onClose={() => setLanguageSheet(false)}
        onSelect={(language) => {
          void i18n.changeLanguage(language);
          setLanguageSheet(false);
        }}
        visible={languageSheet}
      />

      <BottomSheet
        onClose={() => setPrivacySheet(false)}
        testID="privacy-sheet"
        title={t("driver.profile.privacy")}
        visible={privacySheet}
      >
        <Text style={styles.privacyBody} testID="privacy-body">
          {t("onboarding.permissions.disclosure.onlyDuringTrips")}
        </Text>
        <Text style={styles.privacyBody}>
          {t("onboarding.permissions.disclosure.verifiedExperience")}
        </Text>
        <Text style={styles.privacyBody}>
          {t("onboarding.permissions.disclosure.sharedWithOps")}
        </Text>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.md },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.primary,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  avatarText: { fontFamily: fonts.bold, fontSize: fontSize.title, color: colors.onAccent },
  headerTexts: { flex: 1, gap: 2 },
  name: { fontFamily: fonts.semibold, fontSize: fontSize.title, color: colors.textInverse },
  phone: { fontFamily: fonts.regular, fontSize: fontSize.body, color: colors.textInverseMuted },
  since: { fontFamily: fonts.medium, fontSize: fontSize.caption, color: colors.accent },
  healthHint: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
  privacyBody: { fontFamily: fonts.regular, fontSize: fontSize.body, color: colors.text },
});
