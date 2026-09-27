import { Stack } from 'expo-router';

import { AreaGuard } from '@/features/auth/AreaGuard';
import { usePermissionRecheck } from '@/features/onboarding/DriverGate';

export default function OnboardingLayout() {
  // Coming back from system Settings refreshes the D1 rows.
  usePermissionRecheck();
  return (
    <AreaGuard allowed={['driver']}>
      <Stack screenOptions={{ headerShown: false }} />
    </AreaGuard>
  );
}
