import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { classifyError } from '@/lib/errors';
import { colors, sizes } from '@/theme/tokens';

/** Shared data-screen states (M12a): loading, error + retry, empty. */

export function LoadingState() {
  const { t } = useTranslation();
  return (
    <View
      style={styles.box}
      accessibilityRole="progressbar"
      accessibilityLabel={t('common.refreshing')}
    >
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.body}>{t('common.refreshing')}</Text>
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation();
  const { key, params, kind } = classifyError(error);
  return (
    <View style={styles.box} accessibilityRole="alert" testID="error-state">
      <Text style={styles.title} accessibilityRole="header">
        {kind === 'network' ? t('common.offline') : t('errors.loadFailedTitle')}
      </Text>
      <Text style={styles.body}>{t(key, params)}</Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={t('common.retry')}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Text style={styles.buttonText}>{t('common.retry')}</Text>
      </Pressable>
    </View>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.box} accessible accessibilityLabel={`${title}. ${body}`}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 24,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    marginBottom: 14,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  button: {
    minHeight: sizes.minTouch,
    minWidth: 140,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  pressed: { opacity: 0.85 },
  buttonText: { color: colors.onPrimary, fontSize: 16, fontWeight: '700' },
});
