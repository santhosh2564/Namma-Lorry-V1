import { PlaceholderScreen } from "@/components/PlaceholderScreen";
import { SCREENS } from "@/lib/screens";

/** D1 Location Permission — real screen in M9 (prominent disclosure per doc 09). */
export default function PermissionsPlaceholder() {
  return <PlaceholderScreen screenId={SCREENS.D1.id} title={SCREENS.D1.title} />;
}
