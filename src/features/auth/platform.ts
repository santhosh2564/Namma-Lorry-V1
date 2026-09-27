/**
 * Platform detection for the routing gate (M5).
 *
 * `routing.ts` stays free of react-native so it can be unit tested, which
 * leaves the one mapping from `Platform.OS` to `AppPlatform` in this module.
 * The console also runs on tablets and desktops, which expo-router reports
 * under other `Platform.OS` values; none of them run trips, so they are
 * treated as web (docs/04 §1, TRD §4.4).
 */
import { Platform } from "react-native";

import type { AppPlatform } from "@/features/auth/routing";

export function currentPlatform(): AppPlatform {
  switch (Platform.OS) {
    case "ios":
      return "ios";
    case "android":
      return "android";
    default:
      return "web";
  }
}
