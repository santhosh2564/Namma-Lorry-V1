import { PlaceholderScreen } from "@/components/PlaceholderScreen";
import { SCREENS } from "@/lib/screens";

/** C1 Live Dashboard — real screen in M11 (all in_progress trips on the map). */
export default function LiveDashboardPlaceholder() {
  return <PlaceholderScreen screenId={SCREENS.C1.id} title={SCREENS.C1.title} />;
}
