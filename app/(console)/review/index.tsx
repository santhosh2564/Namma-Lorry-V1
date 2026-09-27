import { PlaceholderScreen } from "@/components/PlaceholderScreen";
import { SCREENS } from "@/lib/screens";

/** C7 Review Queue — real screen in M11. */
export default function ReviewQueuePlaceholder() {
  return <PlaceholderScreen screenId={SCREENS.C7.id} title={SCREENS.C7.title} />;
}
