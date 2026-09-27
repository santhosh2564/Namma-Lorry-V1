import { useLocalSearchParams } from "expo-router";

import { PlaceholderScreen } from "@/components/PlaceholderScreen";
import { SCREENS } from "@/lib/screens";

/** D5 Active Trip — real screen in M10 (live map, sync status, END TRIP). */
export default function ActiveTripPlaceholder() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <PlaceholderScreen
      screenId={SCREENS.D5.id}
      title={SCREENS.D5.title}
      note={id ? `trip: ${id}` : undefined}
    />
  );
}
