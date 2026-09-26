import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';

import { isHovered } from './hover';
import { colors, fonts, radius, sizes, space } from '@/theme/tokens';

export interface NavItem {
  href: '/console' | `/console/${string}`;
  label: string;
  icon: ComponentProps<typeof MaterialIcons>['name'];
  badge?: number;
}

/** Active for the exact route, or any child route (except Live, which is the index). */
export function isActive(pathname: string, href: string): boolean {
  return href === '/console'
    ? pathname === '/console' || pathname === '/console/'
    : pathname.startsWith(href);
}

export function Sidebar({ items, collapsed }: { items: NavItem[]; collapsed: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <View
      style={[styles.bar, { width: collapsed ? sizes.sidebarCollapsed : sizes.sidebar }]}
      role="navigation"
    >
      <View style={[styles.brand, collapsed && styles.center]}>
        <MaterialCommunityIcons name="truck" size={28} color={colors.accent} />
        {collapsed ? null : (
          <Text variant="subtitle" tone="onPrimary">
            Namma Lorry Ops
          </Text>
        )}
      </View>
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        const badge = item.badge ? (item.badge > 99 ? '99+' : String(item.badge)) : null;
        return (
          <Pressable
            key={item.href}
            onPress={() => router.navigate(item.href)}
            accessibilityRole="link"
            accessibilityLabel={badge ? `${item.label}, ${badge} waiting` : item.label}
            accessibilityState={{ selected: active }}
            style={(state) => [
              styles.item,
              collapsed && styles.center,
              (active || isHovered(state)) && styles.itemActive,
            ]}
          >
            <View>
              <MaterialIcons
                name={item.icon}
                size={24}
                color={active ? colors.accent : colors.onPrimaryMuted}
              />
              {collapsed && badge ? <View style={styles.dot} /> : null}
            </View>
            {collapsed ? null : (
              <>
                <Text style={[styles.label, { color: active ? colors.onPrimary : colors.onPrimaryMuted }]}>
                  {item.label}
                </Text>
                {badge ? (
                  <View style={styles.badge}>
                    <Text variant="caption" style={styles.badgeText}>
                      {badge}
                    </Text>
                  </View>
                ) : null}
              </>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.primary,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    gap: space.xs,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
    height: 48,
    marginBottom: space.md,
  },
  center: { justifyContent: 'center', paddingHorizontal: 0 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: sizes.touchMin,
    paddingHorizontal: space.md,
    borderRadius: radius.button,
  },
  itemActive: { backgroundColor: colors.sidebarActive },
  label: { fontFamily: fonts.medium, fontSize: 15, flex: 1 },
  badge: {
    backgroundColor: colors.review,
    borderRadius: radius.chip,
    minWidth: 24,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  badgeText: { color: colors.onPrimary, fontFamily: fonts.bold },
  dot: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.review,
  },
});
