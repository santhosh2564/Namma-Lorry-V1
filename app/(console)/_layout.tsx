import { Stack } from "expo-router";

import { colors } from "@/theme/tokens";

/**
 * Console layout (M1 placeholder): a Stack so every console route is
 * reachable and typed. The real sidebar/topbar shell arrives in M6
 * (doc 13 P7); the review/[id] route from doc 04 was merged into C6 (doc 12).
 */
export default function ConsoleLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
