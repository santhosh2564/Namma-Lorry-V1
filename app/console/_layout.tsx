import { useQueryClient } from '@tanstack/react-query';
import { Slot, usePathname, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { Sidebar, type NavItem } from '@/components/console/Sidebar';
import { TopBar } from '@/components/console/TopBar';
import { AreaGuard } from '@/features/auth/AreaGuard';
import { signOut } from '@/features/auth/signOut';
import { useProfile } from '@/features/auth/useProfile';
import { formatPhone, routeSearch } from '@/features/console/consoleData';
import { useReviewCount } from '@/features/console/queries';
import { pick, t, useLanguage } from '@/i18n';
import { colors } from '@/theme/tokens';

export default function ConsoleLayout() {
  useLanguage(); // re-render on language change (M12a)
  // Admin-only: AreaGuard sends every other role to its own destination (docs/04 §2).
  return (
    <AreaGuard allowed={['console']}>
      <ConsoleShell />
    </AreaGuard>
  );
}

function titleFor(pathname: string): string {
  const exact = pick(t.console.titles, pathname.replace(/\/$/, ''), '');
  if (exact) return exact;
  if (pathname.startsWith('/console/loads/')) return t.console.titles.load;
  if (pathname.startsWith('/console/trips/')) return t.console.titles.trip;
  return t.console.titles.console;
}

function ConsoleShell() {
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const profile = useProfile();
  const reviewCount = useReviewCount();
  const [signingOut, setSigningOut] = useState(false);

  const nav: NavItem[] = [
    { href: '/console', label: t.console.nav.live, icon: 'sensors' },
    { href: '/console/loads', label: t.console.nav.loads, icon: 'inventory-2' },
    { href: '/console/trips', label: t.console.nav.trips, icon: 'alt-route' },
    { href: '/console/review', label: t.console.nav.review, icon: 'fact-check', badge: reviewCount.data },
    { href: '/console/drivers', label: t.console.nav.drivers, icon: 'badge' },
    { href: '/console/vehicles', label: t.console.nav.vehicles, icon: 'local-shipping' },
  ];

  return (
    <View style={styles.shell}>
      <Sidebar items={nav} collapsed={width < 1024} />
      <View style={styles.main}>
        <TopBar
          title={titleFor(pathname)}
          compact={width < 900}
          user={{ name: profile.data?.full_name || 'Admin', phone: formatPhone(profile.data?.phone ?? null) }}
          signOutBusy={signingOut}
          onSearch={(raw) => {
            const target = routeSearch(raw);
            if (target) router.push({ pathname: target.path, params: { q: target.q } });
          }}
          onSignOut={async () => {
            setSigningOut(true);
            try {
              await signOut(queryClient); // AreaGuard then redirects to sign-in
            } finally {
              setSigningOut(false);
            }
          }}
        />
        <View style={styles.content}>
          <Slot />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, flexDirection: 'row', backgroundColor: colors.background },
  main: { flex: 1, minWidth: 0 },
  content: { flex: 1 },
});
