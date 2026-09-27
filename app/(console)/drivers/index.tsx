import { PlaceholderScreen } from "@/components/PlaceholderScreen";
import { SCREENS } from "@/lib/screens";

/** C8 Drivers — real screen in M6 (Add Driver via admin-create-driver). */
export default function DriversPlaceholder() {
  return <PlaceholderScreen screenId={SCREENS.C8.id} title={SCREENS.C8.title} />;
}
