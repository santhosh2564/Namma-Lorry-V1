import { PlaceholderScreen } from "@/components/PlaceholderScreen";
import { SCREENS } from "@/lib/screens";

/**
 * S4 Access Notice (M1 placeholder). Three variants arrive in M5:
 * driver-on-web, owner/shipper "coming soon", deactivated account.
 */
export default function AccessNoticePlaceholder() {
  return <PlaceholderScreen screenId={SCREENS.S4.id} title={SCREENS.S4.title} />;
}
