import { PlaceholderScreen } from "@/components/PlaceholderScreen";
import { SCREENS } from "@/lib/screens";

/** D3 My Trips (driver home tab) — real screen in M9. */
export default function MyTripsPlaceholder() {
  return <PlaceholderScreen screenId={SCREENS.D3.id} title={SCREENS.D3.title} />;
}
