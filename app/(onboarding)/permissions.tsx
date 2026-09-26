import { Link } from 'expo-router';

import { Placeholder } from '@/components/Placeholder';
import { Button } from '@/components/ui';

export default function LocationPermission() {
  return (
    <Placeholder id="D1" title="Location Permission" milestone="M9">
      {/* The permission check is a stub until M9, so drivers always land here first. */}
      <Link href="/battery" asChild>
        <Button label="Continue" />
      </Link>
    </Placeholder>
  );
}
