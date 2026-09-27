import type { ReactElement, ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type RefreshControlProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, sizes, space } from '@/theme/tokens';

export interface ScreenProps {
  children: ReactNode;
  /** Scrollable content with keyboard avoidance (forms). */
  scroll?: boolean;
  background?: 'default' | 'surface' | 'primary';
  /** Centre the content column vertically. */
  centered?: boolean;
  /** Pull to refresh (scroll screens only). */
  refreshControl?: ReactElement<RefreshControlProps>;
}

const bgColor = { default: colors.background, surface: colors.surface, primary: colors.primary };

/** Safe-area aware page with a max-width column so mobile layouts stay readable on web. */
export function Screen({
  children,
  scroll = false,
  background = 'default',
  centered = false,
  refreshControl,
}: ScreenProps) {
  const column = <View style={[styles.column, centered && styles.centered]}>{children}</View>;
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: bgColor[background] }]}>
      {scroll ? (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            refreshControl={refreshControl}
          >
            {column}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        column
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: sizes.maxContentWidth,
    alignSelf: 'center',
    padding: space.lg,
    gap: space.lg,
  },
  centered: { justifyContent: 'center' },
});
