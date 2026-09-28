/**
 * D8 language sheet (M11, docs/12 D8).
 *
 * "Settings list: Language (English)" — tapping it opens this sheet. The four
 * languages are the ones the app ships (docs/12, ND on Noto Sans covering Tamil,
 * Kannada and Hindi); a driver who needs another one is a translation request,
 * not a picker with an empty result.
 *
 * Changing the language is immediate and local: i18next swaps the resources in
 * place, and there is nothing to save on a server.
 */
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { BottomSheet, ListRow } from "@/components/ui";
import { supportedLanguages, type Language } from "@/i18n";
import { colors } from "@/theme/tokens";

export type LanguageSheetProps = {
  visible: boolean;
  current: string;
  onClose: () => void;
  onSelect: (language: Language) => void;
};

export function LanguageSheet({ visible, current, onClose, onSelect }: LanguageSheetProps) {
  const { t } = useTranslation();

  return (
    <BottomSheet
      onClose={onClose}
      testID="language-sheet"
      title={t("driver.profile.language")}
      visible={visible}
    >
      <View testID="language-sheet-options">
        {supportedLanguages.map((language) => (
          <ListRow
            icon={language === current ? "radio_button_checked" : "radio_button_unchecked"}
            iconColor={language === current ? colors.primary : colors.textDisabled}
            key={language}
            onPress={() => onSelect(language)}
            testID={`language-option-${language}`}
            title={t(`language.${language}`)}
          />
        ))}
      </View>
    </BottomSheet>
  );
}
