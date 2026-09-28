import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Banner, Button, Card, Icon } from "@/components/ui";
import { useAuthStore } from "@/features/auth/store";
import {
  batteryInfoForDevice,
  isBatterySetupNeeded,
  openBatterySettings,
  readDeviceManufacturer,
} from "@/features/onboarding/battery";
import { colors, fonts, fontSize, spacing } from "@/theme/tokens";

/**
 * D2 Battery Setup (docs/12 D2, Android only).
 *
 * The screen detects the manufacturer (expo-device) and shows that brand's
 * exact steps plus a button that opens the relevant settings screen. It is
 * deliberately skippable — an over-eager gate would strand a driver whose
 * brand's steps did not match their skin — but D3 reminds a driver whose trips
 * start showing tracking gaps.
 *
 * On web/iOS the screen renders the "not needed" note and still forwards, so
 * the onboarding stack has the same shape on every platform.
 */
export default function BatteryScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [opening, setOpening] = useState(false);
  const [openFailed, setOpenFailed] = useState(false);

  const manufacturer = useAuthStore((state) => state.deviceManufacturer);
  const needed = isBatterySetupNeeded();
  const info = batteryInfoForDevice(manufacturer);

  // The brand is read once per launch and cached in the store; web renders the note.
  useEffect(() => {
    if (manufacturer === null) {
      useAuthStore.getState().setDeviceManufacturer(readDeviceManufacturer());
    }
  }, [manufacturer]);

  const openSettings = useCallback(async () => {
    setOpening(true);
    setOpenFailed(false);
    const ok = await openBatterySettings(info.brand);
    setOpening(false);
    if (!ok) {
      setOpenFailed(true);
    }
  }, [info.brand]);

  if (!needed) {
    return <NotNeeded />;
  }

  return (
    <SafeAreaView style={styles.safe} testID="onboarding-battery-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.step}>{t("onboarding.battery.step")}</Text>
        <Text style={styles.title}>{t("onboarding.battery.title")}</Text>
        <Text style={styles.subtitle}>{t("onboarding.battery.subtitle")}</Text>

        <Card style={styles.brandCard} testID="onboarding-battery-brand">
          <Icon name="smartphone" size={20} color={colors.primary} />
          <Text style={styles.brandLabel}>
            {t("onboarding.battery.detectedBrand", {
              brand: t(`onboarding.battery.brands.${info.labelKey}`),
            })}
          </Text>
        </Card>

        <Text style={styles.explanation}>{t("onboarding.battery.explanation")}</Text>

        <Card style={styles.stepsCard} testID="onboarding-battery-steps">
          {info.steps.map((step, index) => (
            <View key={step.key} style={styles.stepRow}>
              <Text style={styles.stepNumber}>{index + 1}</Text>
              <Icon name={step.icon} size={18} color={colors.primary} />
              <Text style={styles.stepText}>
                {t(`onboarding.battery.steps.${info.labelKey}.${step.key}`)}
              </Text>
            </View>
          ))}
        </Card>

        {openFailed ? (
          <Banner
            message={t("onboarding.battery.openFailed")}
            testID="onboarding-battery-open-failed"
            variant="warning"
          />
        ) : null}

        <Button
          fullWidth
          label={t("onboarding.battery.openSettings")}
          loading={opening}
          onPress={() => void openSettings()}
          size="driver"
          testID="onboarding-battery-open"
        />
        <Button
          fullWidth
          label={t("onboarding.battery.done")}
          onPress={() => router.replace("/(driver)")}
          size="driver"
          testID="onboarding-battery-done"
          variant="outline"
        />
        <Button
          label={t("onboarding.battery.skip")}
          onPress={() => router.replace("/(driver)")}
          size="sm"
          testID="onboarding-battery-skip"
          variant="text"
        />
      </ScrollView>
    </SafeAreaView>
  );
}

/** iOS / web: the flow is Android-only (docs/12 D2). */
function NotNeeded() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe} testID="onboarding-battery-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.notNeeded}>
        <Text style={styles.title}>{t("onboarding.battery.title")}</Text>
        <Text style={styles.explanation}>{t("onboarding.battery.notNeeded")}</Text>
        <Button
          fullWidth
          label={t("onboarding.battery.continueToTrips")}
          onPress={() => router.replace("/(driver)")}
          size="driver"
          testID="onboarding-battery-continue"
        />
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
  brandCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  brandLabel: { fontFamily: fonts.medium, fontSize: fontSize.body, color: colors.text },
  explanation: { fontFamily: fonts.regular, fontSize: fontSize.body, color: colors.textSecondary },
  stepsCard: { gap: spacing.md },
  stepRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primaryMuted,
    color: colors.primary,
    fontFamily: fonts.semibold,
    fontSize: fontSize.caption,
    textAlign: "center",
    textAlignVertical: "center",
  },
  stepText: { flex: 1, fontFamily: fonts.regular, fontSize: fontSize.body, color: colors.text },
  notNeeded: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.lg,
  },
});
