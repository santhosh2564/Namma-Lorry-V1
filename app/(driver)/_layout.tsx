import { Tabs } from "expo-router";
import { Text } from "react-native";

import { colors } from "@/theme/tokens";

/** Driver tabs (doc 04): Trips · History · Profile. Real UI in M9/M11. */
export default function DriverLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Trips",
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>{"🚚"}</Text>,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>{"🕘"}</Text>,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>{"👤"}</Text>,
        }}
      />
    </Tabs>
  );
}
