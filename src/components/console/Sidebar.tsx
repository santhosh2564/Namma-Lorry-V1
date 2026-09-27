import type { StyleProp, ViewStyle } from "react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "@/components/ui/Icon";
import { colors, fonts, fontSize, layout, spacing, touch } from "@/theme/tokens";

export type SidebarItem = {
  key: string;
  label: string;
  /** Material Symbols ligature. */
  icon: string;
  /** Optional count badge (e.g. the Review queue). */
  badge?: number;
};

export type SidebarProps = {
  items: SidebarItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  brand?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Ink-navy vertical nav used by the ops console (docs/12 §6). */
export function Sidebar({
  items,
  activeKey,
  onSelect,
  brand = "Namma Lorry Ops",
  style,
  testID,
}: SidebarProps) {
  return (
    <View style={[styles.sidebar, style]} testID={testID}>
      <Text style={styles.brand}>{brand}</Text>
      <View style={styles.nav}>
        {items.map((item) => {
          const active = item.key === activeKey;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onSelect(item.key)}
              style={({ pressed }) => [
                styles.item,
                active ? styles.itemActive : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <Icon
                name={item.icon}
                size={22}
                color={active ? colors.onPrimary : colors.primaryMuted}
              />
              <Text style={[styles.label, active ? styles.labelActive : null]}>{item.label}</Text>
              {item.badge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.badge}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: layout.sidebarWidth,
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    gap: spacing.xl,
  },
  brand: { fontFamily: fonts.semibold, fontSize: fontSize.subtitle, color: colors.onPrimary },
  nav: { gap: spacing.xs },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: touch.min,
    paddingHorizontal: spacing.sm,
    borderRadius: 10,
  },
  itemActive: { backgroundColor: colors.primaryPressed },
  pressed: { opacity: 0.85 },
  label: { flex: 1, fontFamily: fonts.medium, fontSize: fontSize.body, color: colors.primaryMuted },
  labelActive: { color: colors.onPrimary },
  badge: {
    minWidth: 22,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: 11,
    backgroundColor: colors.review,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 12, color: colors.onPrimary },
});
