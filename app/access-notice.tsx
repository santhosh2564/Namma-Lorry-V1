import { MaterialIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { Button, Screen, Text } from '@/components/ui';
import { AreaGuard } from '@/features/auth/AreaGuard';
import type { NoticeVariant } from '@/features/auth/routing';
import { SignOutButton } from '@/features/auth/SignOutButton';
import { useRoutingDecision } from '@/features/auth/useRoutingDecision';
import { t, useLanguage } from '@/i18n';
import { config } from '@/lib/config';
import { colors, space } from '@/theme/tokens';

const icons: Record<NoticeVariant, ComponentProps<typeof MaterialIcons>['name']> = {
  'driver-web': 'smartphone',
  'coming-soon': 'schedule',
  deactivated: 'block',
  'no-profile': 'person-off',
};

/**
 * S4 Access Notice. The variant always comes from the routing decision,
 * never from the URL, so it can't be spoofed to show the wrong message.
 */
export default function AccessNoticeRoute() {
  useLanguage(); // re-render on language change (M12a)
  return (
    <AreaGuard allowed={['notice']}>
      <AccessNotice />
    </AreaGuard>
  );
}

function AccessNotice() {
  const { destination } = useRoutingDecision();
  if (destination.kind !== 'notice') return null;
  const variant = destination.variant;
  const copy = t.notice[variant];
  const stores =
    variant === 'driver-web'
      ? [
          {
            label: t.notice['driver-web'].playStore,
            url: config.EXPO_PUBLIC_PLAY_STORE_URL,
            icon: 'android' as const,
          },
          {
            label: t.notice['driver-web'].appStore,
            url: config.EXPO_PUBLIC_APP_STORE_URL,
            icon: 'phone-iphone' as const,
          },
        ].filter((s) => !!s.url)
      : [];

  return (
    <Screen centered>
      <View style={styles.body}>
        <View style={styles.iconCircle}>
          <MaterialIcons name={icons[variant]} size={56} color={colors.primary} />
        </View>
        <Text variant="title" align="center" accessibilityRole="header">
          {copy.title}
        </Text>
        <Text tone="secondary" align="center">
          {copy.body}
        </Text>
      </View>
      <View style={styles.actions}>
        {stores.map((s) => (
          <Button key={s.label} label={s.label} variant="outline" onPress={() => Linking.openURL(s.url!)} />
        ))}
        <SignOutButton variant={stores.length ? 'text' : 'outline'} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { alignItems: 'center', gap: space.md },
  iconCircle: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  actions: { gap: space.sm, marginTop: space.lg },
});
