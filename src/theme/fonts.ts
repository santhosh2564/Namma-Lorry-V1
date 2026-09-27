import { MaterialSymbols_400Regular } from "@expo-google-fonts/material-symbols";
import {
  NotoSans_400Regular,
  NotoSans_500Medium,
  NotoSans_600SemiBold,
  NotoSans_700Bold,
} from "@expo-google-fonts/noto-sans";
import { useFonts } from "expo-font";

/**
 * Font loading (M2). Noto Sans is the product typeface (DESIGN.md); it must
 * later cover Tamil, Kannada and Hindi — those are P1 (doc 13 M12a).
 * Material Symbols (ND-16) backs the Icon component as a ligature font.
 */
export const appFontMap = {
  NotoSans_400Regular,
  NotoSans_500Medium,
  NotoSans_600SemiBold,
  NotoSans_700Bold,
  MaterialSymbols_400Regular,
} as const;

/** Loads every app font. Returns [loaded, error] like expo-font's useFonts. */
export function useAppFonts() {
  return useFonts(appFontMap);
}
