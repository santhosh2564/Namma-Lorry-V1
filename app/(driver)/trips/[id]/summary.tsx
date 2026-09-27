import { useLocalSearchParams } from "expo-router";

import { PlaceholderScreen } from "@/components/PlaceholderScreen";
import { SCREENS } from "@/lib/screens";

/** D6 Trip Summary — real screen in M10 (verification result + reasons). */
export default function TripSummaryPlaceholder() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <PlaceholderScreen
      screenId={SCREENS.D6.id}
      title={SCREENS.D6.title}
      note={id ? `trip: ${id}` : undefined}
    />
  );
}
