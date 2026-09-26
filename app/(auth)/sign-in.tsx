import { MaterialIcons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Pressable, StyleSheet, View } from 'react-native';

import { Banner, Button, Card, Logo, PhoneInput, Screen, Text } from '@/components/ui';
import { mapSendOtpError, type SendOtpError } from '@/features/auth/errors';
import { nationalPhoneSchema, signInSchema, toE164, type SignInForm } from '@/features/auth/schemas';
import { useAuthStore } from '@/features/auth/store';
import { t } from '@/i18n/en';
import { supabase } from '@/lib/supabase';
import { colors, radius, space } from '@/theme/tokens';

/** S2 Sign in (design/1._sign_in). */
export default function SignIn() {
  const router = useRouter();
  const pendingPhone = useAuthStore((s) => s.pendingPhone);
  const setOtpSent = useAuthStore((s) => s.setOtpSent);
  const [sendError, setSendError] = useState<SendOtpError | null>(null);
  const [showLanguageNote, setShowLanguageNote] = useState(false);

  const { control, handleSubmit, formState } = useForm<SignInForm>({
    resolver: zodResolver(signInSchema),
    defaultValues: { phone: pendingPhone ? pendingPhone.replace(/^\+91/, '') : '' },
    mode: 'onTouched',
  });
  const valid = nationalPhoneSchema.safeParse(useWatch({ control, name: 'phone' })).success;

  const onSubmit = handleSubmit(async ({ phone }) => {
    setSendError(null);
    const e164 = toE164(phone);
    // shouldCreateUser: false — only numbers an admin registered may sign in (PRD P0-1, ND-12).
    const { error } = await supabase.auth.signInWithOtp({
      phone: e164,
      options: { shouldCreateUser: false },
    });
    if (error) {
      setSendError(mapSendOtpError(error));
      return;
    }
    setOtpSent(e164);
    router.push('/verify');
  });

  const fieldError = formState.errors.phone ? t.signIn.errors.invalid_phone : undefined;

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Logo />
        <Text variant="subtitle" align="center">
          {t.signIn.title}
        </Text>
        <Text tone="secondary" align="center">
          {t.signIn.subtitle}
        </Text>
      </View>

      <Card>
        <Controller
          control={control}
          name="phone"
          render={({ field }) => (
            <PhoneInput
              testID="phone-input"
              label={t.signIn.phoneLabel}
              clearLabel={t.signIn.clear}
              value={field.value}
              onChangeText={(v) => {
                setSendError(null);
                field.onChange(v);
              }}
              onBlur={field.onBlur}
              onSubmitEditing={valid ? onSubmit : undefined}
              editable={!formState.isSubmitting}
              error={fieldError}
            />
          )}
        />
        {sendError ? <Banner tone="error" message={t.signIn.errors[sendError]} testID="send-error" /> : null}
      </Card>

      <Button
        testID="send-otp"
        label={t.signIn.sendOtp}
        icon="arrow-forward"
        disabled={!valid}
        loading={formState.isSubmitting}
        onPress={onSubmit}
      />

      <Pressable
        accessibilityRole="button"
        onPress={() => setShowLanguageNote((v) => !v)}
        style={styles.language}
      >
        <MaterialIcons name="language" size={22} color={colors.live} />
        <View style={styles.grow}>
          <Text variant="bodyStrong">{t.signIn.changeLanguage}</Text>
          {showLanguageNote ? (
            <Text variant="caption" tone="secondary">
              {t.signIn.languageSoon}
            </Text>
          ) : null}
        </View>
        <MaterialIcons name="expand-more" size={22} color={colors.textSecondary} />
      </Pressable>

      <View style={styles.footer}>
        <MaterialIcons name="support-agent" size={20} color={colors.review} />
        <Text variant="bodyStrong" style={styles.flex}>
          {t.signIn.newDriver}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: space.sm, paddingTop: space.md },
  language: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    minHeight: 48,
    borderRadius: radius.card,
    backgroundColor: colors.surfaceMuted,
  },
  footer: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 'auto',
    padding: space.md,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  flex: { flexShrink: 1 },
  grow: { flex: 1 },
});
