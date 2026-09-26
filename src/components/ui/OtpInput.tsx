import { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { colors, radius, sizes, space, type } from '@/theme/tokens';

import { Text } from './Text';

export interface OtpInputProps {
  value: string;
  onChangeText: (code: string) => void;
  length?: number;
  error?: boolean;
  accessibilityLabel: string;
  autoFocus?: boolean;
  testID?: string;
}

/**
 * Six visual boxes backed by one hidden TextInput, so paste and SMS autofill
 * (iOS oneTimeCode, Android sms-otp) fill every box at once.
 */
export function OtpInput({
  value,
  onChangeText,
  length = 6,
  error = false,
  accessibilityLabel,
  autoFocus = true,
  testID,
}: OtpInputProps) {
  const ref = useRef<TextInput>(null);
  const [focused, setFocused] = useState(autoFocus);
  const active = Math.min(value.length, length - 1);

  return (
    <Pressable onPress={() => ref.current?.focus()} accessible={false}>
      <View style={styles.row}>
        {Array.from({ length }, (_, i) => {
          const isActive = focused && i === active;
          return (
            <View
              key={i}
              style={[styles.box, isActive && styles.boxActive, error && styles.boxError]}
              importantForAccessibility="no-hide-descendants"
            >
              <Text style={type.digit}>{value[i] ?? ''}</Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={ref}
        testID={testID}
        accessibilityLabel={accessibilityLabel}
        value={value}
        onChangeText={(t) => onChangeText(t.replace(/\D/g, '').slice(0, length))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoFocus={autoFocus}
        keyboardType="number-pad"
        inputMode="numeric"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        caretHidden
        style={styles.hidden}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  box: {
    flex: 1,
    maxWidth: sizes.otpBox + 8,
    height: sizes.otpBox + 8,
    borderRadius: radius.input,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderColor: colors.primary, borderWidth: 2.5 },
  boxError: { borderColor: colors.danger },
  hidden: { position: 'absolute', opacity: 0, width: 1, height: 1 },
});
