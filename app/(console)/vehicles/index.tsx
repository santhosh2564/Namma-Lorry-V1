import { PlaceholderScreen } from "@/components/PlaceholderScreen";
import { SCREENS } from "@/lib/screens";

/** C9 Vehicles — real screen in M6. */
export default function VehiclesPlaceholder() {
  return <PlaceholderScreen screenId={SCREENS.C9.id} title={SCREENS.C9.title} />;
}
