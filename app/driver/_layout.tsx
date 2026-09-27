import { Stack } from 'expo-router';

import { AreaGuard } from '@/features/auth/AreaGuard';
import { DriverGate } from '@/features/onboarding/DriverGate';

export default function DriverLayout() {
  return (
    <AreaGuard allowed={['driver']}>
      <DriverGate>
        <Stack screenOptions={{ headerShown: false }} />
      </DriverGate>
    </AreaGuard>
  );
}
