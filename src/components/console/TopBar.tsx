import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Text } from '@/components/ui';

import { isHovered } from './hover';
import { colors, fonts, radius, shadow, sizes, space, type } from '@/theme/tokens';

export interface TopBarProps {
  title: string;
  onSearch: (q: string) => void;
  user: { name: string; phone: string };
  onSignOut: () => void;
  signOutBusy?: boolean;
  compact?: boolean;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0]![0] ?? '') + (parts.length > 1 ? (parts.at(-1)![0] ?? '') : '')).toUpperCase();
}

export function TopBar({ title, onSearch, user, onSignOut, signOutBusy, compact }: TopBarProps) {
  const [q, setQ] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  function submit() {
    if (!q.trim()) return;
    onSearch(q);
    setQ('');
  }

  return (
    <View style={styles.bar}>
      <Text variant="title" accessibilityRole="header" numberOfLines={1} style={styles.title}>
        {title}
      </Text>
      <View style={[styles.search, compact && styles.searchCompact]}>
        <MaterialIcons name="search" size={20} color={colors.textSecondary} />
        <TextInput
          accessibilityLabel="Search Load ID, vehicle or driver"
          placeholder="Search Load ID, vehicle or driver"
          placeholderTextColor={colors.textSecondary}
          value={q}
          onChangeText={setQ}
          onSubmitEditing={submit}
          returnKeyType="search"
          style={styles.searchInput}
        />
      </View>
      <View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Account menu for ${user.name}`}
          accessibilityState={{ expanded: menuOpen }}
          onPress={() => setMenuOpen((o) => !o)}
          style={styles.avatar}
        >
          <Text style={styles.avatarText}>{initials(user.name)}</Text>
        </Pressable>
        {menuOpen ? (
          <View style={styles.menu} accessibilityRole="menu">
            <View style={styles.menuHead}>
              <Text variant="bodyStrong">{user.name}</Text>
              <Text variant="caption" tone="secondary">
                {user.phone} · Admin
              </Text>
            </View>
            <Pressable
              accessibilityRole="menuitem"
              disabled={signOutBusy}
              onPress={() => {
                setMenuOpen(false);
                onSignOut();
              }}
              style={(state) => [styles.menuItem, isHovered(state) && styles.menuHover]}
            >
              <MaterialIcons name="logout" size={20} color={colors.danger} />
              <Text tone="danger">Sign out</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: sizes.topBar,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    zIndex: 10,
  },
  title: { flexShrink: 1 },
  search: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    width: 360,
    height: 40,
    paddingHorizontal: space.md,
    borderRadius: radius.chip,
    backgroundColor: colors.surfaceMuted,
  },
  searchCompact: { width: 200 },
  searchInput: { ...type.body, flex: 1, color: colors.text, outlineWidth: 0, minWidth: 0 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.onPrimary, fontFamily: fonts.bold, fontSize: 15 },
  menu: {
    position: 'absolute',
    top: 48,
    right: 0,
    width: 240,
    backgroundColor: colors.surface,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  menuHead: { padding: space.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, minHeight: 48 },
  menuHover: { backgroundColor: colors.surfaceMuted },
});
