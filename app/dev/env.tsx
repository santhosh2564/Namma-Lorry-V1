import { StyleSheet, Text, View } from "react-native";

import { config, isDev } from "@/lib/config";
import { spacing } from "@/theme/tokens";

/**
 * Dev diagnostics (M1): shows which config values are present, never their
 * secrets. Gated behind __DEV__ in M12a; for now the /dev group is the only
 * place this exists.
 */
export default function DevEnv() {
  const entries: [string, boolean][] = [
    ["EXPO_PUBLIC_SUPABASE_URL", config.supabaseUrl.length > 0],
    ["EXPO_PUBLIC_SUPABASE_ANON_KEY", config.supabaseAnonKey.length > 0],
    ["EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY", config.mapplsMapSdkKey.length > 0],
    ["EXPO_PUBLIC_SENTRY_DSN", config.sentryDsn.length > 0],
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>appEnv: {config.appEnv}</Text>
      <Text style={styles.heading}>isDev: {String(isDev)}</Text>
      {entries.map(([name, present]) => (
        <Text key={name} style={styles.row}>
          {present ? "✅" : "⚠️"} {name}: {present ? "set" : "missing"}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, gap: spacing.sm },
  heading: { fontWeight: "700", fontSize: 16 },
  row: { fontSize: 14 },
});
