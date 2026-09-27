import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, radii, spacing } from "@/theme/tokens";

type PlaceholderScreenProps = {
  /** Doc 12 screen ID, e.g. "S2" or "C6". */
  screenId: string;
  /** Human title, e.g. "Sign in". */
  title: string;
  /** Optional note about when this screen is implemented. */
  note?: string;
};

/**
 * M1 placeholder: every doc 12 screen gets a route that renders its ID and
 * title so navigation compiles. Milestones M5+ replace these with real screens.
 */
export function PlaceholderScreen({ screenId, title, note }: PlaceholderScreenProps) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.chip}>
          <Text style={styles.chipText}>{screenId}</Text>
        </View>
        <Text style={styles.title}>{title}</Text>
        {note ? <Text style={styles.note}>{note}</Text> : null}
        <Text style={styles.footer}>Placeholder — implemented in a later milestone</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  chip: {
    backgroundColor: colors.accent,
    borderRadius: radii.chip,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  chipText: {
    color: colors.primary,
    fontWeight: "700",
    fontSize: 13,
    letterSpacing: 1,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "600",
    textAlign: "center",
  },
  note: {
    color: colors.textSecondary,
    fontSize: 15,
    textAlign: "center",
  },
  footer: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: spacing.sm,
  },
});
