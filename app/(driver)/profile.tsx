import { PlaceholderScreen } from "@/components/PlaceholderScreen";
import { SCREENS } from "@/lib/screens";

/** D8 My Profile (tab) — real screen in M11 (read-only driver stats). */
export default function ProfilePlaceholder() {
  return <PlaceholderScreen screenId={SCREENS.D8.id} title={SCREENS.D8.title} />;
}
