import { PlaceholderScreen } from "@/components/PlaceholderScreen";
import { SCREENS } from "@/lib/screens";

/** C3 Create Load — real screen in M7 (autosuggest, radius, planned distance). */
export default function CreateLoadPlaceholder() {
  return <PlaceholderScreen screenId={SCREENS.C3.id} title={SCREENS.C3.title} />;
}
