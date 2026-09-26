import { Stack } from 'expo-router';

import { AreaGuard } from '@/features/auth/AreaGuard';

export default function DriverLayout() {
  return (
    <AreaGuard allowed={['driver']}>
      {/* M9: bottom tabs Trips · History · Profile */}
      <Stack screenOptions={{ headerShown: false }} />
    </AreaGuard>
  );
}
