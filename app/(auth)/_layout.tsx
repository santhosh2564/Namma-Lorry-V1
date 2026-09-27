import { Redirect, Stack } from "expo-router";

import { useAuthStore } from "@/features/auth/store";
import { SCREENS } from "@/lib/screens";

/**
 * S2 + S3 only (docs/04 §1). A user who already has a session and lands here
 * by deep link is sent back to the gate, which routes them to the screen their
 * role actually belongs on.
 */
export default function AuthLayout() {
  const status = useAuthStore((state) => state.status);

  if (status === "signed_in") {
    return <Redirect href={SCREENS.S1.route} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
