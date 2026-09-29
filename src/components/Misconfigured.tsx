import { StyleSheet, Text, View } from 'react-native';

import i18n from '@/i18n';
import { colors } from '@/theme/tokens';

/**
 * Blocking screen for a release build with an invalid/missing env (src/lib/config.ts
 * `configError`). Rendered by app/_layout.tsx instead of the navigator: the app must not
 * run against a guessed backend. No retry — only a new build fixes it. The technical
 * detail goes to Sentry, never on screen.
 */
export function Misconfigured() {
  return (
    <View style={styles.screen} accessibilityRole="alert" testID="misconfigured">
      <Text style={styles.title} accessibilityRole="header">
        {i18n.t('errors.misconfiguredTitle')}
      </Text>
      <Text style={styles.body}>{i18n.t('errors.misconfiguredBody')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.background,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  body: {
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
});
