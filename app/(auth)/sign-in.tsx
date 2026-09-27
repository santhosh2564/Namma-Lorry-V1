import { useRouter } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";

import { Banner, BottomSheet, Button, Icon, ListRow, PhoneInput, Screen } from "@/components/ui";
import { sendOtp } from "@/features/auth/api";
import { AuthError, type AuthErrorCode, authErrorMessageKey } from "@/features/auth/errors";
import { phoneSchema, toE164 } from "@/features/auth/schemas";
import { nowMs, useAuthStore } from "@/features/auth/store";
import { supportedLanguages, type Language } from "@/i18n";
import { SCREENS } from "@/lib/screens";
import { colors, fonts, fontSize, radii, spacing } from "@/theme/tokens";

/**
 * S2 Sign in (docs/12, doc 04 §4 A1): a +91 number and "Send OTP".
 *
 * The four documented states are all reachable from here — invalid number
 * (zod), unregistered (ND-12's `shouldCreateUser: false`), rate-limited and
 * offline — and each one is a plain i18n string rather than a Supabase message.
 */
type SignInForm = { phone: string };

const FIELD_ERRORS: AuthErrorCode[] = ["invalid_phone", "unregistered"];

export default function SignInScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const [errorCode, setErrorCode] = useState<AuthErrorCode | null>(null);
  const [languageSheetOpen, setLanguageSheetOpen] = useState(false);

  const startOtpChallenge = useAuthStore((state) => state.startOtpChallenge);
  const {
    control,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<SignInForm>({ defaultValues: { phone: "" }, mode: "onSubmit" });

  const onSubmit = handleSubmit(async ({ phone }) => {
    const parsed = phoneSchema.safeParse(phone);
    if (!parsed.success) {
      setError("phone", { message: "auth.invalidPhone" });
      return;
    }

    setErrorCode(null);
    const e164 = toE164(parsed.data);

    try {
      await sendOtp(e164);
      startOtpChallenge(e164, nowMs());
      router.push(SCREENS.S3.route);
    } catch (error) {
      setErrorCode(error instanceof AuthError ? error.code : "unknown");
      // The number itself is the problem, not the connection: show it on the
      // field the way doc 12 specifies.
      if (error instanceof AuthError && FIELD_ERRORS.includes(error.code)) {
        setError("phone", { message: authErrorMessageKey(error.code) });
      }
    }
  });

  const showBanner = errorCode !== null && !FIELD_ERRORS.includes(errorCode);
  const bannerMessage = errorCode === null ? "" : t(authErrorMessageKey(errorCode));
  const otherLanguages = supportedLanguages
    .filter((code) => code !== i18n.language)
    .map((code) => t(`language.${code}`))
    .join(" • ");

  return (
    <Screen testID="sign-in-screen">
      <View style={styles.header}>
        <View style={styles.brandMark}>
          <Icon name="local_shipping" size={28} color={colors.primary} />
        </View>
        <Text style={styles.title}>{t("auth.signInTitle")}</Text>
        <Text style={styles.subtitle}>{t("auth.signInSubtitle")}</Text>
      </View>

      {showBanner ? (
        <Banner
          message={bannerMessage}
          onDismiss={() => setErrorCode(null)}
          style={styles.banner}
          testID="sign-in-error"
          variant={errorCode === "rate_limited" ? "warning" : "error"}
        />
      ) : null}

      <Controller
        control={control}
        name="phone"
        render={({ field }) => (
          <PhoneInput
            disabled={isSubmitting}
            errorText={errors.phone ? t(errors.phone.message as string) : undefined}
            onChangeText={(value) => {
              field.onChange(value);
              if (errors.phone) {
                clearErrors("phone");
              }
            }}
            testID="sign-in-phone"
            value={field.value}
          />
        )}
      />

      <Button
        fullWidth
        icon="arrow_forward"
        label={t("auth.sendOtp")}
        loading={isSubmitting}
        onPress={onSubmit}
        size="lg"
        testID="sign-in-submit"
      />

      <ListRow
        icon="language"
        onPress={() => setLanguageSheetOpen(true)}
        style={styles.languageRow}
        subtitle={otherLanguages}
        testID="sign-in-language"
        title={t("auth.changeLanguage", { language: t(`language.${i18n.language}`) })}
      />

      <View style={styles.footer}>
        <Text style={styles.footerText}>{t("auth.newDriver")}</Text>
      </View>

      <BottomSheet
        onClose={() => setLanguageSheetOpen(false)}
        title={t("auth.languageSheetTitle")}
        visible={languageSheetOpen}
      >
        {supportedLanguages.map((code: Language) => (
          <ListRow
            key={code}
            onPress={() => {
              void i18n.changeLanguage(code);
              setLanguageSheetOpen(false);
            }}
            right={
              i18n.language === code ? (
                <Icon name="check" size={20} color={colors.verified} />
              ) : null
            }
            title={t(`language.${code}`)}
          />
        ))}
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: "center", gap: spacing.xs, marginBottom: spacing.xl },
  brandMark: {
    width: 56,
    height: 56,
    borderRadius: radii.card,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentMuted,
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.title,
    lineHeight: 28,
    color: colors.text,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSize.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
  banner: { marginBottom: spacing.md },
  languageRow: { marginTop: spacing.lg },
  footer: { flex: 1, justifyContent: "flex-end", paddingTop: spacing.xl },
  footerText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    textAlign: "center",
  },
});
