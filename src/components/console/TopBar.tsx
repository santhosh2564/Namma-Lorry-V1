import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, Text, View } from "react-native";

import { TextField } from "@/components/ui/TextField";
import { borderWidth, colors, fonts, fontSize, layout, spacing, touch } from "@/theme/tokens";

export type TopBarProps = {
  title: string;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  /** Admin avatar initials, e.g. "MS". */
  avatarInitials?: string;
  /** Extra trailing controls. */
  actions?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** White console top bar: page title, global search and admin avatar. */
export function TopBar({
  title,
  searchPlaceholder = "Search Load ID, vehicle or driver",
  searchValue,
  onSearchChange,
  avatarInitials = "NL",
  actions,
  style,
  testID,
}: TopBarProps) {
  return (
    <View style={[styles.bar, style]} testID={testID}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.searchWrap}>
        <TextField
          icon="search"
          onChangeText={onSearchChange}
          placeholder={searchPlaceholder}
          value={searchValue ?? ""}
        />
      </View>
      {actions}
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{avatarInitials}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    minHeight: layout.topBarHeight,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.border,
  },
  title: { fontFamily: fonts.semibold, fontSize: fontSize.title, color: colors.text },
  searchWrap: { flex: 1, maxWidth: 420 },
  avatar: {
    width: touch.min - 8,
    height: touch.min - 8,
    borderRadius: (touch.min - 8) / 2,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: fonts.semibold, fontSize: fontSize.body, color: colors.onPrimary },
});
