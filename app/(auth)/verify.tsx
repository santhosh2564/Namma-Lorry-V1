import { PlaceholderScreen } from "@/components/PlaceholderScreen";
import { SCREENS } from "@/lib/screens";

/** S3 Verify OTP — real screen in M5. */
export default function VerifyPlaceholder() {
  return <PlaceholderScreen screenId={SCREENS.S3.id} title={SCREENS.S3.title} />;
}
