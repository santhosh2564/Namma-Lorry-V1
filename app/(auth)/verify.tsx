import { Redirect, useRouter } from "expo-router";
import { useCallback, useEffect, useReducer, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Banner, Button, Icon, OtpInput, Screen } from "@/components/ui";
import { sendOtp, verifyOtp } from "@/features/auth/api";
import { AuthError, type AuthErrorCode, authErrorMessageKey } from "@/features/auth/errors";
import { formatCountdown, maskPhone, otpSchema } from "@/features/auth/schemas";
import { nowMs, useAuthStore } from "@/features/auth/store";
import { SCREENS } from "@/lib/screens";
import { borderWidth, colors, fonts, fontSize, radii, spacing, touch } from "@/theme/tokens";

/**
 * S3 Verify OTP (docs/12, doc 04 §4 A2).
 *
 * The number comes from the store, which S2 filled when it requested the code.
 * A deep link straight to this route with no challenge is sent back to S2
 * rather than showing an empty form.
 *
 * Wrong codes are counted locally (three attempts, matching what Supabase
 * allows) and an expired code drops the resend cooldown, because waiting 30
 * seconds for a code the server has already thrown away helps nobody.
 */
export default function VerifyOtpScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const pendingPhone = useAuthStore((state) => state.pendingPhone);
  const resendAvailableAt = useAuthStore((state) => state.resendAvailableAt);
  const attemptsLeft = useAuthStore((state) => state.attemptsLeft);
  const registerFailedAttempt = useAuthStore((state) => state.registerFailedAttempt);
  const restartResendCooldown = useAuthStore((state) => state.restartResendCooldown);
  const allowResendNow = useAuthStore((state) => state.allowResendNow);

  const [code, setCode] = useState("");
  const [errorCode, setErrorCode] = useState<AuthErrorCode | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const secondsLeft = useResendCountdown(resendAvailableAt);

  const backToSignIn = useCallback(() => {
    setErrorCode(null);
    router.replace(SCREENS.S2.route);
  }, [router]);

  const onVerify = useCallback(async () => {
    if (pendingPhone === null || submitting) {
      return;
    }
    const parsed = otpSchema.safeParse(code);
    if (!parsed.success) {
      setErrorCode("wrong_code");
      return;
    }

    setSubmitting(true);
    setErrorCode(null);

    try {
      await verifyOtp(pendingPhone, parsed.data);
      // The session lands through the auth listener, which flips the store and
      // the S1 gate takes over — no manual navigation here.
    } catch (error) {
      const code_ = error instanceof AuthError ? error.code : "unknown";
      setCode("");
      if (code_ === "wrong_code") {
        registerFailedAttempt();
      }
      if (code_ === "expired_code") {
        allowResendNow();
      }
      setErrorCode(code_);
    } finally {
      setSubmitting(false);
    }
  }, [allowResendNow, code, pendingPhone, registerFailedAttempt, submitting]);

  const onResend = useCallback(async () => {
    if (pendingPhone === null || resending) {
      return;
    }
    setResending(true);
    setErrorCode(null);
    setResent(false);

    try {
      await sendOtp(pendingPhone);
      restartResendCooldown(nowMs());
      setCode("");
      setResent(true);
    } catch (error) {
      setErrorCode(error instanceof AuthError ? error.code : "unknown");
    } finally {
      setResending(false);
    }
  }, [pendingPhone, resending, restartResendCooldown]);

  if (pendingPhone === null) {
    return <Redirect href={SCREENS.S2.route} />;
  }

  const attemptsExhausted = attemptsLeft === 0;
  const message =
    errorCode === "wrong_code" ? t("auth.wrongCode", { attempts: attemptsLeft }) : null;

  return (
    <Screen testID="verify-screen">
      <View style={styles.topBar}>
        <Pressable
          accessibilityLabel={t("auth.back")}
          accessibilityRole="button"
          onPress={backToSignIn}
          style={({ pressed }) => [styles.backButton, pressed ? styles.pressed : null]}
          testID="verify-back"
        >
          <Icon name="arrow_back" size={24} color={colors.primary} />
        </Pressable>
        <View style={styles.secureChip}>
          <Icon name="shield" size={16} color={colors.verified} />
          <Text style={styles.secureChipText}>{t("common.appName")}</Text>
        </View>
      </View>

      <Text style={styles.title}>{t("auth.verifyTitle")}</Text>
      <View style={styles.sentRow}>
        <Text style={styles.sentTo}>
          {t("auth.verifySentTo", { phone: maskPhone(pendingPhone) })}
        </Text>
        <Text accessibilityRole="button" onPress={backToSignIn} style={styles.edit}>
          {t("auth.editNumber")}
        </Text>
      </View>

      {message ? (
        <Banner
          message={message}
          onDismiss={() => setErrorCode(null)}
          style={styles.banner}
          testID="verify-error"
          variant="error"
        />
      ) : null}
      {errorCode !== null && message === null ? (
        <Banner
          message={t(authErrorMessageKey(errorCode))}
          onDismiss={() => setErrorCode(null)}
          style={styles.banner}
          testID="verify-error"
          variant={errorCode === "rate_limited" ? "warning" : "error"}
        />
      ) : null}
      {resent ? (
        <Banner
          message={t("auth.resendSent")}
          onDismiss={() => setResent(false)}
          style={styles.banner}
          testID="verify-resent"
          variant="success"
        />
      ) : null}

      <OtpInput
        autoFocus
        invalid={errorCode === "wrong_code" || errorCode === "expired_code"}
        onChangeText={(value) => {
          setCode(value);
          if (errorCode) {
            setErrorCode(null);
          }
        }}
        style={styles.otp}
        testID="verify-otp"
        value={code}
      />

      {secondsLeft > 0 ? (
        <Text style={styles.resend} testID="verify-countdown">
          {t("auth.resendIn", { time: formatCountdown(secondsLeft) })}
        </Text>
      ) : (
        <Text
          accessibilityRole="button"
          disabled={resending}
          onPress={onResend}
          style={styles.resendLink}
          testID="verify-resend"
        >
          {t("auth.resendNow")}
        </Text>
      )}

      <Button
        disabled={attemptsExhausted || code.length !== 6}
        fullWidth
        icon="arrow_forward"
        label={t("auth.verifyContinue")}
        loading={submitting}
        onPress={onVerify}
        size="lg"
        style={styles.cta}
        testID="verify-submit"
      />
    </Screen>
  );
}

/**
 * Seconds until a deadline, ticking once a second. Returns 0 immediately when
 * there is no cooldown, which is what puts the "Resend code now" link up.
 *
 * The remaining time is derived during render rather than mirrored into state,
 * so a new deadline (a fresh resend) shows up at once instead of on the next
 * tick; the interval only exists to make the component re-render each second.
 */
function useResendCountdown(deadline: number | null): number {
  const [, tick] = useReducer((count: number) => count + 1, 0);

  useEffect(() => {
    if (deadline === null) {
      return;
    }
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [deadline]);

  return secondsUntil(deadline);
}

function secondsUntil(deadline: number | null): number {
  if (deadline === null) {
    return 0;
  }
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xl,
  },
  backButton: {
    width: touch.min,
    height: touch.min,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border,
  },
  pressed: { backgroundColor: colors.surfaceAlt },
  secureChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.chip,
    backgroundColor: colors.surface,
  },
  secureChipText: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
  title: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.title,
    lineHeight: 28,
    color: colors.text,
  },
  sentRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xxs },
  sentTo: { fontFamily: fonts.regular, fontSize: fontSize.caption, color: colors.textSecondary },
  edit: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.caption,
    color: colors.primary,
    textDecorationLine: "underline",
  },
  banner: { marginTop: spacing.lg },
  otp: { marginTop: spacing.xxl },
  resend: {
    fontFamily: fonts.medium,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.lg,
  },
  resendLink: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.caption,
    color: colors.live,
    textAlign: "center",
    textDecorationLine: "underline",
    marginTop: spacing.lg,
  },
  cta: { marginTop: spacing.xl },
});
