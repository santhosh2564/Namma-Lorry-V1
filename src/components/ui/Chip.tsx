import { MaterialIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, fonts, radius, space } from '@/theme/tokens';

import { Text } from './Text';

export type ChipTone = 'neutral' | 'live' | 'verified' | 'review' | 'danger' | 'accent';

const tones: Record<ChipTone, { fg: string; bg: string }> = {
  neutral: { fg: colors.textSecondary, bg: colors.surfaceMuted },
  live: { fg: colors.live, bg: colors.liveSoft },
  verified: { fg: colors.verified, bg: colors.verifiedSoft },
  review: { fg: colors.review, bg: colors.accentSoft },
  danger: { fg: colors.danger, bg: colors.dangerSoft },
  accent: { fg: colors.text, bg: colors.accentSoft },
};

/** Status chip: icon + text + colour, never colour alone (DESIGN.md). */
export function Chip({
  label,
  tone = 'neutral',
  icon,
}: {
  label: string;
  tone?: ChipTone;
  icon?: ComponentProps<typeof MaterialIcons>['name'];
}) {
  const t = tones[tone];
  return (
    <View style={[styles.chip, { backgroundColor: t.bg }]}>
      {icon ? <MaterialIcons name={icon} size={14} color={t.fg} /> : null}
      <Text variant="caption" style={[styles.text, { color: t.fg }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.xs,
    paddingHorizontal: space.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.chip,
  },
  text: { fontFamily: fonts.semibold },
});
