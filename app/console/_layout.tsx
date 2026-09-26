import { Stack } from 'expo-router';

import { AreaGuard } from '@/features/auth/AreaGuard';

export default function ConsoleLayout() {
  return (
    <AreaGuard allowed={['console']}>
      {/* M6: sidebar shell (Live · Loads · Trips · Review · Drivers · Vehicles) */}
      <Stack screenOptions={{ headerShown: false }} />
    </AreaGuard>
  );
}
