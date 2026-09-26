import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, Text } from '@/components/ui';
import { useAuthStore } from '@/features/auth/store';
import { catalogs, LANGUAGE_NAMES, LANGUAGES, t, translatedShare, useLanguage, type Language } from '@/i18n';
import { colors, radius, space } from '@/theme/tokens';

import { chooseLanguage } from './language';

/** Share of each catalog that is translated; computed once (the JSON is bundled). */
const SHARE: Record<Language, number> = Object.fromEntries(
  LANGUAGES.map((l) => [l, translatedShare(catalogs[l])]),
) as Record<Language, number>;

/** Language picker sheet (docs/12 overlays), used on S2 Sign in and D8 My Profile. */
export function LanguageSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const current = useLanguage();
  const signedIn = useAuthStore((s) => s.status === 'signed-in');
  const [saveFailed, setSaveFailed] = useState(false);

  async function pick(l: Language) {
    setSaveFailed(!(await chooseLanguage(l, signedIn)));
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel={t.common.close} />
      <SafeAreaView edges={['bottom']} style={styles.sheet} testID="language-sheet">
        <Text variant="title" accessibilityRole="header">
          {t.language.title}
        </Text>
        <View accessibilityRole="radiogroup">
          {LANGUAGES.map((l) => (
            <Pressable
              key={l}
              testID={`language-${l}`}
              accessibilityRole="radio"
              accessibilityLabel={LANGUAGE_NAMES[l]}
              accessibilityState={{ checked: l === current }}
              onPress={() => void pick(l)}
              style={styles.row}
            >
              <MaterialIcons
                name={l === current ? 'radio-button-checked' : 'radio-button-unchecked'}
                size={24}
                color={colors.primary}
              />
              <View style={styles.flex}>
                <Text>{LANGUAGE_NAMES[l]}</Text>
                {SHARE[l] < 1 ? (
                  <Text variant="caption" tone="secondary">
                    {t.language.partial}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
        {saveFailed ? <Banner tone="warn" message={t.language.saveFailed} /> : null}
        <Button label={t.common.close} variant="outline" onPress={onClose} testID="language-close" />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  scrim: { flex: 1, backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.surface,
    padding: space.lg,
    gap: space.md,
    borderTopLeftRadius: radius.card + 8,
    borderTopRightRadius: radius.card + 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    paddingVertical: space.xs,
  },
});
