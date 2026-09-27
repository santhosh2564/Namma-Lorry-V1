import { useLocalSearchParams } from "expo-router";

import { PlaceholderScreen } from "@/components/PlaceholderScreen";
import { SCREENS } from "@/lib/screens";

/** C4 Load Detail & Assign — real screen in M7. */
export default function LoadDetailPlaceholder() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <PlaceholderScreen
      screenId={SCREENS.C4.id}
      title={SCREENS.C4.title}
      note={id ? `load: ${id}` : undefined}
    />
  );
}
