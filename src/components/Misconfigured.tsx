import { StyleSheet, Text, View } from "react-native";

import i18n from "@/i18n";
import type { ConfigProblem } from "@/lib/config";
import { colors, fontSize, spacing } from "@/theme/tokens";

type Props = { problems: readonly ConfigProblem[] };

/**
 * Blocking screen for a staging or production build whose env is missing or
 * invalid (validation M2, src/lib/config.ts `configProblems`). Rendered by
 * app/_layout.tsx in place of the whole app: it must not run against a
 * guessed backend. No retry, because only a new build fixes it. The key names
 * are shown so a tester can say what to fix; values never are.
 *
 * Drawn before the app fonts load, so it uses the system font.
 */
export function Misconfigured({ problems }: Props) {
  const keys = [...new Set(problems.map((p) => p.key))].join(", ");
  return (
    <View accessibilityRole="alert" style={styles.screen} testID="misconfigured">
      <Text accessibilityRole="header" style={styles.title}>
        {i18n.t("common.misconfigured.title")}
      </Text>
      <Text style={styles.body}>{i18n.t("common.misconfigured.body")}</Text>
      <Text style={styles.details}>{i18n.t("common.misconfigured.details", { keys })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: fontSize.subtitle,
    fontWeight: "600",
    color: colors.text,
    textAlign: "center",
  },
  body: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
    textAlign: "center",
    maxWidth: 360,
  },
  details: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    textAlign: "center",
    maxWidth: 360,
  },
});
