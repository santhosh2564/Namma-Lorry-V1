import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { colors } from '@/theme/tokens';

type PlaceholderScreenProps = {
  screenId: string;
  /** English fallback; the shown title comes from en.json `screens.<screenId>` when it exists. */
  title: string;
  milestone: string;
};

/**
 * Shared placeholder for every screen scaffolded in M1 (doc 12 screen list).
 * Replaced screen-by-screen from M5 onwards.
 */
export function PlaceholderScreen({ screenId, title, milestone }: PlaceholderScreenProps) {
  const { t } = useTranslation();
  const heading = t(`screens.${screenId}`, { defaultValue: title });
  return (
    <View
      testID={`placeholder-${screenId}`}
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        backgroundColor: colors.background,
      }}
    >
      <Text
        style={{
          fontSize: 13,
          fontWeight: 'bold',
          letterSpacing: 1,
          color: colors.textSecondary,
          marginBottom: 8,
        }}
      >
        {screenId}
      </Text>
      <Text
        accessibilityRole="header"
        style={{ fontSize: 24, fontWeight: 'bold', color: colors.primary, textAlign: 'center' }}
      >
        {heading}
      </Text>
      <Text
        style={{ fontSize: 14, color: colors.textSecondary, marginTop: 8, textAlign: 'center' }}
      >
        {t('placeholder.comingSoon', { milestone })}
      </Text>
    </View>
  );
}
