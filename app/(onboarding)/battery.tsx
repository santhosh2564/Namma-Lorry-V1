import { Platform, Text } from "react-native";

import { PlaceholderScreen } from "@/components/PlaceholderScreen";
import { SCREENS } from "@/lib/screens";

/** D2 Battery Setup — real screen in M9 (Android only). */
export default function BatteryPlaceholder() {
  if (Platform.OS === "web") {
    return <Text>Battery setup is only needed on Android.</Text>;
  }
  return <PlaceholderScreen screenId={SCREENS.D2.id} title={SCREENS.D2.title} />;
}
