import { Link } from 'expo-router';

import { Placeholder } from '@/components/Placeholder';
import { Button } from '@/components/ui';

export default function BatterySetup() {
  return (
    <Placeholder id="D2" title="Battery Setup" milestone="M9">
      <Link href="/driver" replace asChild>
        <Button label="Continue" />
      </Link>
    </Placeholder>
  );
}
