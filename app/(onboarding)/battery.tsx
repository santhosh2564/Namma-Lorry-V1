import * as Device from 'expo-device';
import * as IntentLauncher from 'expo-intent-launcher';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { Banner, Button, Card, Chip, Screen, Text } from '@/components/ui';
import { batteryGuide, detectBrand } from '@/features/onboarding/batteryGuide';
import { setBatterySetup, type BatterySetup } from '@/features/onboarding/batteryFlag';
import { t, useLanguage } from '@/i18n';
import { colors, space } from '@/theme/tokens';

const s = t.battery;

/** Namma Lorry's App info page (battery + autostart switches), else the battery-optimisation list. */
async function openBatterySettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch {
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS,
    );
  }
}

/** D2 Battery Setup (Android): stop the phone's battery saver from killing trip tracking. */
export default function BatterySetupScreen() {
  useLanguage(); // re-render on language change (M12a)
  const router = useRouter();
  const guide = batteryGuide(detectBrand(Device.manufacturer, Device.brand));
  const [openFailed, setOpenFailed] = useState(false);

  async function finish(v: BatterySetup) {
    await setBatterySetup(v);
    router.replace('/');
  }

  return (
    <Screen scroll background="surface">
      <Text variant="caption" tone="secondary">
        {s.step}
      </Text>
      {guide.label ? <Chip label={s.detected(guide.label)} tone="accent" icon="smartphone" /> : null}
      <Text variant="title" accessibilityRole="header">
        {s.title}
      </Text>
      <Banner tone="warn" message={s.body} />

      <Card>
        <Text variant="subtitle">{s.stepsTitle}</Text>
        {guide.steps.map((step, i) => (
          <View key={step} style={styles.step} testID={`d2-step-${i + 1}`}>
            <View style={styles.num}>
              <Text variant="bodyStrong" tone="onPrimary">
                {i + 1}
              </Text>
            </View>
            <Text style={styles.flex}>{step}</Text>
          </View>
        ))}
      </Card>

      {openFailed ? <Banner tone="error" message={s.openFailed} /> : null}
      <View style={styles.actions}>
        <Button
          label={s.openSettings}
          icon="battery-charging-full"
          testID="d2-open-settings"
          onPress={() =>
            void openBatterySettings().then(
              () => setOpenFailed(false),
              () => setOpenFailed(true),
            )
          }
        />
        <Button label={s.done} variant="outline" testID="d2-done" onPress={() => void finish('done')} />
        <Button label={s.skip} variant="text" testID="d2-skip" onPress={() => void finish('skipped')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  step: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  num: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { gap: space.sm },
});
