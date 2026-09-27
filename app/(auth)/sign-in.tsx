import { PlaceholderScreen } from "@/components/PlaceholderScreen";
import { SCREENS } from "@/lib/screens";

/** S2 Sign in — real screen in M5. */
export default function SignInPlaceholder() {
  return <PlaceholderScreen screenId={SCREENS.S2.id} title={SCREENS.S2.title} />;
}
