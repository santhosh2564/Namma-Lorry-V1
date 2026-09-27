import type { StyleProp, TextStyle } from "react-native";
import { Text } from "react-native";

import { colors, fonts } from "@/theme/tokens";

export type IconProps = {
  /** Material Symbols ligature name, e.g. "check_circle" or "local_shipping". */
  name: string;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
  /** Accessibility label; the glyph itself is hidden from screen readers. */
  accessibilityLabel?: string;
};

/**
 * Material Symbols Rounded icon (ND-16), rendered as a ligature from the font
 * loaded by `src/theme/fonts.ts`. Wrapping the font here means the whole app
 * can swap to a vector-icon package without changing call sites.
 */
export function Icon({
  name,
  size = 24,
  color = colors.text,
  style,
  accessibilityLabel,
}: IconProps) {
  return (
    <Text
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={accessibilityLabel === undefined}
      importantForAccessibility={accessibilityLabel === undefined ? "no-hide-descendants" : "yes"}
      style={[{ fontFamily: fonts.icon, fontSize: size, lineHeight: size, color }, style]}
    >
      {name}
    </Text>
  );
}
