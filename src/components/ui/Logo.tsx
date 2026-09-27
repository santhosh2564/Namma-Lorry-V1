import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { colors, space, type } from '@/theme/tokens';

import { Text } from './Text';
import { t } from '@/i18n';

/** Amber lorry mark + "Namma Lorry" wordmark (design/namma_lorry_brand_logo). */
export function Logo({ size = 'md', onDark = false }: { size?: 'md' | 'lg'; onDark?: boolean }) {
  const icon = size === 'lg' ? 72 : 36;
  return (
    <View
      style={[styles.row, size === 'lg' && styles.stack]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={t.common.appName}
    >
      <MaterialCommunityIcons name="truck" size={icon} color={colors.accent} />
      <Text
        style={[
          size === 'lg' ? type.display : type.title,
          { color: onDark ? colors.onPrimary : colors.primary },
        ]}
      >
        {t.common.appName}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  stack: { flexDirection: 'column', gap: space.md },
});
