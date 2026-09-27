import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking, StyleSheet, Text, View } from "react-native";

import { Banner, Button, Icon, Screen } from "@/components/ui";
import { signOut } from "@/features/auth/api";
import { AuthError, type AuthErrorCode, authErrorMessageKey } from "@/features/auth/errors";
import {
  type AccessNoticeVariant,
  parseAccessNoticeVariant,
  signOutBlockReason,
} from "@/features/auth/routing";
import { useAuthStore } from "@/features/auth/store";
import { config } from "@/lib/config";
import { SCREENS } from "@/lib/screens";
import { borderWidth, colors, fonts, fontSize, spacing } from "@/theme/tokens";

/**
 * S4 Access Notice (docs/12, doc 04 §2): the screen that explains why a signed
 * -in user cannot continue here.
 *
 * Four variants, three of them from doc 12 — driver on web ("use the mobile
 * app"), owner/shipper ("coming soon") and a deactivated account — plus one
 * the gate needed for a session that has no profile row. The variant arrives
 * as a query parameter from `routePath`; anything unrecognised falls back to
 * the gate rather than guessing a message.
 */
const COPY: Record<AccessNoticeVariant, { icon: string; titleKey: string; bodyKey: string }> = {
  driver_on_web: {
    icon: "smartphone",
    titleKey: "accessNotice.driverOnWeb.title",
    bodyKey: "accessNotice.driverOnWeb.body",
  },
  coming_soon: {
    icon: "hourglass_empty",
    titleKey: "accessNotice.comingSoon.title",
    bodyKey: "accessNotice.comingSoon.body",
  },
  deactivated: {
    icon: "person_off",
    titleKey: "accessNotice.deactivated.title",
    bodyKey: "accessNotice.deactivated.body",
  },
  no_profile: {
    icon: "person_search",
    titleKey: "accessNotice.noProfile.title",
    bodyKey: "accessNotice.noProfile.body",
  },
};

export default function AccessNoticeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ variant?: string | string[] }>();

  const status = useAuthStore((state) => state.status);
  const activeTripId = useAuthStore((state) => state.activeTripId);
  const clearOtpChallenge = useAuthStore((state) => state.clearOtpChallenge);

  const [errorCode, setErrorCode] = useState<AuthErrorCode | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const variant = parseAccessNoticeVariant(params.variant);

  const onSignOut = useCallback(async () => {
    if (signOutBlockReason({ activeTripId }) !== null) {
      return;
    }
    setSigningOut(true);
    setErrorCode(null);
    try {
      await signOut();
      clearOtpChallenge();
      router.replace(SCREENS.S1.route);
    } catch (error) {
      setErrorCode(error instanceof AuthError ? error.code : "unknown");
    } finally {
      setSigningOut(false);
    }
  }, [activeTripId, clearOtpChallenge, router]);

  if (status === "signed_out") {
    return <Redirect href={SCREENS.S2.route} />;
  }
  if (variant === null) {
    return <Redirect href={SCREENS.S1.route} />;
  }

  const copy = COPY[variant];
  const blockedByTrip = signOutBlockReason({ activeTripId }) !== null;
  const showStoreButtons =
    variant === "driver_on_web" && !config.androidStoreUrl && !config.iosStoreUrl;

  return (
    <Screen contentContainerStyle={styles.container} testID="access-notice-screen">
      <View style={styles.iconCircle}>
        <Icon name={copy.icon} size={40} color={colors.primary} />
      </View>
      <Text style={styles.title}>{t(copy.titleKey)}</Text>
      <Text style={styles.body}>{t(copy.bodyKey)}</Text>

      {showStoreButtons ? <Banner message={t("accessNotice.notOnStores")} variant="info" /> : null}

      {errorCode ? (
        <Banner
          message={t(authErrorMessageKey(errorCode))}
          onDismiss={() => setErrorCode(null)}
          variant="error"
        />
      ) : null}

      {blockedByTrip ? <Banner message={t("accessNotice.tripActive")} variant="warning" /> : null}

      <View style={styles.actions}>
        {variant === "driver_on_web" && config.androidStoreUrl ? (
          <Button
            fullWidth
            icon="android"
            label={t("accessNotice.driverOnWeb.play")}
            onPress={() => void Linking.openURL(config.androidStoreUrl)}
            size="lg"
            variant="outline"
          />
        ) : null}
        {variant === "driver_on_web" && config.iosStoreUrl ? (
          <Button
            fullWidth
            icon="phone_iphone"
            label={t("accessNotice.driverOnWeb.appStore")}
            onPress={() => void Linking.openURL(config.iosStoreUrl)}
            size="lg"
            variant="outline"
          />
        ) : null}
        <Button
          fullWidth
          disabled={blockedByTrip}
          label={t("accessNotice.signOut")}
          loading={signingOut}
          onPress={onSignOut}
          size="lg"
          testID="access-notice-sign-out"
          variant="text"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { justifyContent: "center", gap: spacing.md },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryMuted,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.title,
    lineHeight: 28,
    color: colors.text,
    textAlign: "center",
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: fontSize.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  actions: { gap: spacing.md, marginTop: spacing.lg },
});
