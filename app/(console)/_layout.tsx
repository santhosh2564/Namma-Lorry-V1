import { Redirect, Stack, usePathname, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Sidebar, TopBar, UserMenu } from "@/components/console";
import { signOut } from "@/features/auth/api";
import { AuthError } from "@/features/auth/errors";
import { useAuthStore } from "@/features/auth/store";
import { useProfile } from "@/features/auth/useProfile";
import { useConsoleSearch } from "@/features/console/searchStore";
import { useReviewQueueCount } from "@/features/drivers/useDrivers";
import { SCREENS } from "@/lib/screens";
import { colors, fonts, fontSize, spacing } from "@/theme/tokens";

/**
 * Ops console shell (M6, docs/12 §6): sidebar + top bar, admin only.
 *
 * The guard is a redirect rather than a hidden screen: anyone who is not an
 * active admin goes back through the S1 gate, which already knows where a
 * driver, an owner or a shipper belongs. That keeps one routing decision in
 * one place (src/features/auth/routing.ts) instead of a second copy here.
 *
 * RLS is the real boundary — this guard is only about not showing an admin UI
 * to somebody who cannot use it.
 */
const NAV_ITEMS = [
  { key: "live", path: "/", route: "/(console)", labelKey: "console.nav.live", icon: "map" },
  {
    key: "loads",
    path: "/loads",
    route: "/(console)/loads",
    labelKey: "console.nav.loads",
    icon: "inventory_2",
  },
  {
    key: "trips",
    path: "/trips",
    route: "/(console)/trips",
    labelKey: "console.nav.trips",
    icon: "local_shipping",
  },
  {
    key: "review",
    path: "/review",
    route: "/(console)/review",
    labelKey: "console.nav.review",
    icon: "rate_review",
  },
  {
    key: "drivers",
    path: "/drivers",
    route: "/(console)/drivers",
    labelKey: "console.nav.drivers",
    icon: "badge",
  },
  {
    key: "vehicles",
    path: "/vehicles",
    route: "/(console)/vehicles",
    labelKey: "console.nav.vehicles",
    icon: "garage",
  },
] as const;

function Waiting({ label }: { label: string }) {
  return (
    <View style={styles.waiting}>
      <ActivityIndicator color={colors.accent} />
      <Text style={styles.waitingLabel}>{label}</Text>
    </View>
  );
}

export default function ConsoleLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();

  const status = useAuthStore((state) => state.status);
  const clearOtpChallenge = useAuthStore((state) => state.clearOtpChallenge);
  const profileQuery = useProfile();
  const reviewCount = useReviewQueueCount();
  const search = useConsoleSearch((state) => state.search);
  const setSearch = useConsoleSearch((state) => state.setSearch);

  // The session is still being resolved: the splash gate will route, so show
  // the brand rather than bouncing through a redirect.
  if (status === "initialising") {
    return <Waiting label={t("splash.checkingSession")} />;
  }
  if (status === "signed_out") {
    return <Redirect href={SCREENS.S2.route} />;
  }

  const profile = profileQuery.data;
  if (profileQuery.isPending || profile === null || profile === undefined) {
    return <Waiting label={t("console.checkingAccess")} />;
  }
  if (profile.role !== "admin" || !profile.isActive) {
    return <Redirect href={SCREENS.S1.route} />;
  }

  const items = NAV_ITEMS.map((item) => ({
    key: item.key,
    label: t(item.labelKey),
    icon: item.icon,
    // The badge is the C7 backlog; an unknown count shows no badge rather than
    // a misleading zero.
    badge: item.key === "review" && reviewCount.data !== undefined ? reviewCount.data : undefined,
  }));

  // `usePathname` has no route groups, so the console index is "/" and the
  // screens are "/drivers", "/loads" and so on. The longest match wins so a
  // future "/trips/[id]" still highlights Trips.
  const activeKey =
    NAV_ITEMS.filter((item) => item.path !== "/" && pathname.startsWith(item.path)).sort(
      (a, b) => b.path.length - a.path.length,
    )[0]?.key ?? "live";

  const titleKey = NAV_ITEMS.find((item) => item.key === activeKey)?.labelKey ?? "console.nav.live";

  return (
    <SafeAreaView style={styles.safe} testID="console-shell">
      <View style={styles.row}>
        <Sidebar
          activeKey={activeKey}
          items={items}
          onSelect={(key) => {
            const target = NAV_ITEMS.find((item) => item.key === key);
            if (target) {
              router.push(target.route as never);
            }
          }}
          testID="console-sidebar"
        />

        <View style={styles.main}>
          <TopBar
            actions={
              <UserMenu
                fullName={profile.fullName || t("common.appName")}
                onSignOut={() => {
                  void (async () => {
                    try {
                      await signOut();
                      clearOtpChallenge();
                      router.replace(SCREENS.S1.route);
                    } catch (error) {
                      // Nothing useful to do here: the gate will re-check the
                      // session, and a failed sign-out leaves it unchanged.
                      if (!(error instanceof AuthError)) {
                        console.error(error);
                      }
                    }
                  })();
                }}
                roleLabel={t("console.role.admin")}
              />
            }
            onSearchChange={setSearch}
            searchValue={search}
            testID="console-topbar"
            title={t(titleKey)}
          />

          <View style={styles.content}>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
              }}
            />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  row: { flex: 1, flexDirection: "row" },
  main: { flex: 1 },
  content: { flex: 1 },
  waiting: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    backgroundColor: colors.primary,
  },
  waitingLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSize.caption,
    color: colors.textInverseMuted,
  },
});
