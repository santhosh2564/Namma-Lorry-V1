import { PlaceholderScreen } from "@/components/PlaceholderScreen";
import { SCREENS } from "@/lib/screens";

/** C5 Trips list — real screen in M7 (pagination + filters). */
export default function ConsoleTripsPlaceholder() {
  return <PlaceholderScreen screenId={SCREENS.C5.id} title={SCREENS.C5.title} />;
}
