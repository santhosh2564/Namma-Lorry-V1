import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button, Logo, Screen, Text } from '@/components/ui';
import { hrefFor } from '@/features/auth/routing';
import { SignOutButton } from '@/features/auth/SignOutButton';
import { useRoutingDecision } from '@/features/auth/useRoutingDecision';
import { t, useLanguage } from '@/i18n';
import { resumeTracking } from '@/tracking/localState';
import { colors, space } from '@/theme/tokens';

/** S1 Splash: brand, then route per docs/04 §2 (local active trip is checked first). */
export default function Splash() {
  useLanguage(); // re-render on language change (M12a)
  const router = useRouter();
  const { destination, refetch } = useRoutingDecision();

  useEffect(() => {
    const href = hrefFor(destination);
    if (!href) return;
    let cancelled = false;
    (async () => {
      if (destination.kind === 'resume-trip') await resumeTracking(destination.tripId);
      if (!cancelled) router.replace(href);
    })();
    return () => {
      cancelled = true;
    };
  }, [destination, router]);

  return (
    <Screen background="primary" centered>
      <View style={styles.brand}>
        <Logo size="lg" onDark />
        <Text variant="body" tone="onPrimaryMuted" align="center">
          {t.splash.tagline}
        </Text>
      </View>
      <View style={styles.footer}>
        {destination.kind === 'error' ? (
          <>
            <Text tone="onPrimary" align="center">
              {t.splash.error}
            </Text>
            <Button label={t.common.retry} variant="outline" onPress={refetch} />
            <SignOutButton variant="outline" />
          </>
        ) : (
          <>
            <ActivityIndicator color={colors.accent} size="large" />
            {destination.kind === 'resume-trip' ? (
              <Text tone="onPrimary" align="center">
                {t.splash.restoring}
              </Text>
            ) : null}
          </>
        )}
        <Text variant="caption" tone="onPrimaryMuted" align="center">
          v{Constants.expoConfig?.version ?? '1.0.0'}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { flex: 1, justifyContent: 'center', gap: space.md },
  footer: { gap: space.md, paddingBottom: space.lg },
});
