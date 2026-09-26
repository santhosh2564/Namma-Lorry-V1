import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { colors, radius, space } from '@/theme/tokens';

import { Text } from './Text';

type Tone = 'info' | 'warn' | 'error';

const toneStyle: Record<Tone, { bg: string; fg: string; icon: 'info-outline' | 'warning-amber' | 'error-outline' }> = {
  info: { bg: colors.surfaceMuted, fg: colors.primary, icon: 'info-outline' },
  warn: { bg: colors.accentSoft, fg: colors.review, icon: 'warning-amber' },
  error: { bg: colors.dangerSoft, fg: colors.danger, icon: 'error-outline' },
};

/** Inline message. Icon + text so meaning never depends on colour alone. */
export function Banner({ tone = 'info', message, testID }: { tone?: Tone; message: string; testID?: string }) {
  const t = toneStyle[tone];
  return (
    <View
      testID={testID}
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
      style={[styles.row, { backgroundColor: t.bg }]}
    >
      <MaterialIcons name={t.icon} size={20} color={t.fg} />
      <Text variant="body" style={[styles.text, { color: t.fg }]}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: radius.input, alignItems: 'flex-start' },
  text: { flex: 1 },
});
