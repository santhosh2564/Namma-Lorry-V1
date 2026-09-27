import { useLocalSearchParams } from "expo-router";

import { PlaceholderScreen } from "@/components/PlaceholderScreen";
import { SCREENS } from "@/lib/screens";

/** D4 Trip Detail & Start — real screen in M9 (map + geofence + start states). */
export default function TripDetailPlaceholder() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <PlaceholderScreen
      screenId={SCREENS.D4.id}
      title={SCREENS.D4.title}
      note={id ? `trip: ${id}` : undefined}
    />
  );
}
