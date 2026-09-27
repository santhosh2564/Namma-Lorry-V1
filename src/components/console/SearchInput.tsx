import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { colors, radius, space, type } from '@/theme/tokens';

/**
 * Search box that commits on Enter or blur. Render it with `key={value}` so a URL
 * change (back button, global search) resets the draft.
 */
export function SearchInput({
  value,
  onCommit,
  placeholder,
  testID,
}: {
  value: string;
  onCommit: (q: string | undefined) => void;
  placeholder: string;
  testID?: string;
}) {
  const [draft, setDraft] = useState(value);
  const commit = () => draft.trim() !== value && onCommit(draft.trim() || undefined);
  return (
    <TextInput
      testID={testID}
      accessibilityLabel={placeholder}
      placeholder={placeholder}
      placeholderTextColor={colors.textSecondary}
      value={draft}
      onChangeText={setDraft}
      onSubmitEditing={commit}
      onBlur={commit}
      returnKeyType="search"
      style={styles.input}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    ...type.body,
    minWidth: 240,
    flexGrow: 1,
    maxWidth: 420,
    height: 40,
    paddingHorizontal: space.md,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    outlineWidth: 0,
  },
});
