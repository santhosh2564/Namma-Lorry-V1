import { useState } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "@/components/ui/Icon";
import {
  borderWidth,
  colors,
  fonts,
  fontSize,
  layout,
  radii,
  shadows,
  spacing,
  touch,
} from "@/theme/tokens";

export type UserMenuProps = {
  fullName: string;
  /** Shown under the name, e.g. "Admin". */
  roleLabel: string;
  onSignOut: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "NL";
}

/**
 * Avatar button that opens the signed-in user's menu (docs/12 §6). Kept
 * deliberately small: the console is an internal tool, so this is identity and
 * a way out, not an account page.
 */
export function UserMenu({ fullName, roleLabel, onSignOut, style, testID }: UserMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <View style={style} testID={testID}>
      <Pressable
        accessibilityLabel="Account menu"
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={styles.button}
        testID="console-user-menu"
      >
        <Text style={styles.initials}>{initialsOf(fullName)}</Text>
        <Icon name={open ? "expand_less" : "expand_more"} size={20} color={colors.textSecondary} />
      </Pressable>

      {open ? (
        <View style={styles.menu}>
          <View style={styles.header}>
            <Text style={styles.name} numberOfLines={1}>
              {fullName}
            </Text>
            <Text style={styles.role}>{roleLabel}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setOpen(false);
              onSignOut();
            }}
            style={({ pressed }) => [styles.item, pressed ? styles.itemPressed : null]}
            testID="console-sign-out"
          >
            <Icon name="logout" size={20} color={colors.rejected} />
            <Text style={styles.itemLabel}>Sign out</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: touch.min - 8,
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
  },
  initials: {
    width: touch.min - 16,
    height: touch.min - 16,
    borderRadius: (touch.min - 16) / 2,
    lineHeight: touch.min - 16 + 2,
    textAlign: "center",
    backgroundColor: colors.primary,
    color: colors.onPrimary,
    fontFamily: fonts.semibold,
    fontSize: fontSize.caption,
    overflow: "hidden",
  },
  menu: {
    position: "absolute",
    top: layout.topBarHeight - spacing.sm,
    right: 0,
    zIndex: 30,
    minWidth: 220,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border,
    ...shadows.raised,
  },
  header: {
    padding: spacing.md,
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.border,
  },
  name: { fontFamily: fonts.semibold, fontSize: fontSize.body, color: colors.text },
  role: { fontFamily: fonts.regular, fontSize: fontSize.caption, color: colors.textSecondary },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: touch.min,
    paddingHorizontal: spacing.md,
  },
  itemPressed: { backgroundColor: colors.surfaceAlt },
  itemLabel: { fontFamily: fonts.medium, fontSize: fontSize.body, color: colors.rejected },
});
