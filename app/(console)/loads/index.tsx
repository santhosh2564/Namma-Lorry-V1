import { PlaceholderScreen } from "@/components/PlaceholderScreen";
import { SCREENS } from "@/lib/screens";

/** C2 Loads list — real screen in M7. */
export default function LoadsPlaceholder() {
  return <PlaceholderScreen screenId={SCREENS.C2.id} title={SCREENS.C2.title} />;
}
