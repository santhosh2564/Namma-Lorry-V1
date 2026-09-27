import { PlaceholderScreen } from "@/components/PlaceholderScreen";
import { SCREENS } from "@/lib/screens";

/** D7 Trip History (tab) — real screen in M11. */
export default function TripHistoryPlaceholder() {
  return <PlaceholderScreen screenId={SCREENS.D7.id} title={SCREENS.D7.title} />;
}
