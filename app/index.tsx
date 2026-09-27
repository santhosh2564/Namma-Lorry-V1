import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, radii, spacing } from "@/theme/tokens";

/**
 * S1 Splash (M1 placeholder). M5 replaces this with the real gate: check the
 * local tracking state, then route by session and role per doc 04 §2.
 */
export default function SplashPlaceholder() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace("/(auth)/sign-in");
    }, 600);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.logoBox}>
          <Text style={styles.logoText}>NL</Text>
        </View>
        <Text style={styles.wordmark}>Namma Lorry</Text>
        <Text style={styles.tagline}>Your work, verified.</Text>
        <ActivityIndicator style={styles.spinner} color={colors.accent} />
        <Text style={styles.version}>v1.0</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.primary },
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm },
  logoBox: {
    width: 72,
    height: 72,
    borderRadius: radii.card,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  logoText: { color: colors.primary, fontSize: 28, fontWeight: "800" },
  wordmark: { color: colors.textInverse, fontSize: 24, fontWeight: "600" },
  tagline: { color: colors.textInverseMuted, fontSize: 15 },
  spinner: { marginTop: spacing.xl },
  version: { color: colors.textInverseSubtle, fontSize: 12 },
});
