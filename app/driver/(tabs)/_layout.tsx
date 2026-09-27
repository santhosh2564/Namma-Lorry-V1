import { MaterialIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import { t, useLanguage } from '@/i18n';
import { colors, fonts } from '@/theme/tokens';

function icon(name: 'local-shipping' | 'history' | 'person-outline') {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <MaterialIcons name={name} color={color} size={size} />;
  };
}

/** Driver bottom tabs: Trips · History · Profile (docs/04 §1). */
export default function DriverTabs() {
  useLanguage(); // re-render on language change (M12a)
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 12 },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, minHeight: 64 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t.trips.tabs.trips, tabBarIcon: icon('local-shipping') }} />
      <Tabs.Screen name="history" options={{ title: t.trips.tabs.history, tabBarIcon: icon('history') }} />
      <Tabs.Screen
        name="profile"
        options={{ title: t.trips.tabs.profile, tabBarIcon: icon('person-outline') }}
      />
    </Tabs>
  );
}
