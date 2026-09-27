import { useLocalSearchParams } from "expo-router";

import { PlaceholderScreen } from "@/components/PlaceholderScreen";
import { SCREENS } from "@/lib/screens";

/**
 * C6 Trip Detail & Review — real screen in M11. Per doc 12, the review
 * decision lives here (doc 04's separate C8 route was merged in).
 */
export default function ConsoleTripDetailPlaceholder() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <PlaceholderScreen
      screenId={SCREENS.C6.id}
      title={SCREENS.C6.title}
      note={id ? `trip: ${id}` : undefined}
    />
  );
}
