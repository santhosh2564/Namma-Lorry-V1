import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors } from '@/theme/tokens';

import { areaOf, hrefFor, type Area } from './routing';
import { useRoutingDecision } from './useRoutingDecision';
import { t } from '@/i18n';

/**
 * Layout guard: renders its children only when the root routing decision
 * (docs/04 §2) belongs to one of `allowed`; otherwise redirects there.
 * Stops e.g. a driver on web from opening /console by URL, and moves the user
 * on automatically after sign-in or sign-out.
 */
export function AreaGuard({ allowed, children }: { allowed: Area[]; children: ReactNode }) {
  const { destination } = useRoutingDecision();
  if (destination.kind === 'loading') {
    return (
      <View style={styles.center} accessibilityLabel={t.common.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  const area = areaOf(destination);
  if (area && allowed.includes(area)) return <>{children}</>;
  // `error` has no href: the splash shows the retry state.
  return <Redirect href={hrefFor(destination) ?? '/'} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
