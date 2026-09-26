import { MaterialIcons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Banner, Button, OtpInput, Screen, Text } from '@/components/ui';
import {
  RESEND_SECONDS,
  mapSendOtpError,
  mapVerifyOtpError,
  type SendOtpError,
  type VerifyOtpError,
} from '@/features/auth/errors';
import { maskPhone, otpSchema } from '@/features/auth/schemas';
import { useAuthStore } from '@/features/auth/store';
import { formatMmSs, useCountdown } from '@/features/auth/useCountdown';
import { t } from '@/i18n/en';
import { supabase } from '@/lib/supabase';
import { colors, radius, sizes, space } from '@/theme/tokens';

type Message = { tone: 'error' | 'info'; text: string } | null;

/** S3 Verify OTP (design/2._verify_otp). */
export default function Verify() {
  const router = useRouter();
  const phone = useAuthStore((s) => s.pendingPhone);
  const sentAt = useAuthStore((s) => s.otpSentAt);
  const setOtpSent = useAuthStore((s) => s.setOtpSent);

  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [codeError, setCodeError] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const resendIn = useCountdown(sentAt, RESEND_SECONDS);

  if (!phone) return <Redirect href="/sign-in" />;
  const e164 = phone;

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/sign-in');
  }

  async function verify(token: string) {
    if (!otpSchema.safeParse(token).success || verifying) return;
    setVerifying(true);
    setMessage(null);
    const { error } = await supabase.auth.verifyOtp({ phone: e164, token, type: 'sms' });
    setVerifying(false);
    if (error) {
      const secondsSinceSent = sentAt ? (Date.now() - sentAt) / 1000 : Infinity;
      const kind: VerifyOtpError = mapVerifyOtpError(error, secondsSinceSent);
      setCodeError(kind === 'wrong_code' || kind === 'expired');
      setMessage({ tone: 'error', text: t.verify.errors[kind] });
      return;
    }
    // Signed in: the (auth) layout guard now routes by role (docs/04 §2).
    // pendingPhone is kept until sign-out so this screen never flashes a redirect.
  }

  async function resend() {
    setResending(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithOtp({
      phone: e164,
      options: { shouldCreateUser: false },
    });
    setResending(false);
    if (error) {
      const kind: SendOtpError = mapSendOtpError(error);
      setMessage({ tone: 'error', text: t.signIn.errors[kind] });
      return;
    }
    setOtpSent(e164);
    setCode('');
    setCodeError(false);
    setMessage({ tone: 'info', text: t.verify.resent });
  }

  return (
    <Screen scroll>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.common.back}
        onPress={goBack}
        style={styles.back}
        hitSlop={8}
      >
        <MaterialIcons name="arrow-back" size={24} color={colors.primary} />
      </Pressable>

      <View style={styles.header}>
        <Text variant="title">{t.verify.title}</Text>
        <View style={styles.sentRow}>
          <Text tone="secondary">{t.verify.sentTo(maskPhone(e164))} · </Text>
          <Pressable accessibilityRole="link" onPress={goBack} hitSlop={12}>
            <Text variant="bodyStrong" style={styles.edit}>
              {t.verify.edit}
            </Text>
          </Pressable>
        </View>
      </View>

      <OtpInput
        testID="otp-input"
        accessibilityLabel={t.verify.codeLabel}
        value={code}
        error={codeError}
        onChangeText={(v) => {
          setCode(v);
          setCodeError(false);
          if (message?.tone === 'error') setMessage(null);
          if (v.length === 6) void verify(v);
        }}
      />

      <View style={styles.resendRow}>
        {resendIn > 0 ? (
          <>
            <ActivityIndicator size="small" color={colors.live} />
            <Text tone="secondary">{t.verify.resendIn(formatMmSs(resendIn))}</Text>
          </>
        ) : (
          <Button
            label={t.verify.resend}
            variant="text"
            icon="refresh"
            loading={resending}
            onPress={resend}
          />
        )}
      </View>

      {message ? <Banner tone={message.tone} message={message.text} testID="verify-message" /> : null}

      <Button
        testID="verify-submit"
        label={t.verify.submit}
        icon="arrow-forward"
        disabled={code.length !== 6}
        loading={verifying}
        onPress={() => verify(code)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: {
    width: sizes.touchMin,
    height: sizes.touchMin,
    borderRadius: radius.button,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: { gap: space.xs },
  sentRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  edit: { color: colors.primary, textDecorationLine: 'underline' },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    minHeight: 48,
  },
});
