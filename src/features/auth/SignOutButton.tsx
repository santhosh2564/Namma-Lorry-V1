import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { Banner, Button } from '@/components/ui';
import { t } from '@/i18n/en';
import { space } from '@/theme/tokens';

import { signOut } from './signOut';

/** Sign out, refused while a trip is active on this device. */
export function SignOutButton({ variant = 'text' }: { variant?: 'text' | 'outline' }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState<null | 'TRIP_ACTIVE' | 'TRIP_UNSYNCED'>(null);

  async function onPress() {
    setBusy(true);
    try {
      const result = await signOut(queryClient);
      setBlocked(result.ok ? null : result.reason);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: space.sm }}>
      {blocked ? (
        <Banner
          tone="warn"
          message={blocked === 'TRIP_ACTIVE' ? t.notice.signOutBlocked : t.notice.signOutUnsynced}
          testID="signout-blocked"
        />
      ) : null}
      <Button label={t.common.signOut} variant={variant} icon="logout" loading={busy} onPress={onPress} />
    </View>
  );
}
