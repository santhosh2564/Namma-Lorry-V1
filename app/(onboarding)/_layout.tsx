import { Stack } from 'expo-router';

import { AreaGuard } from '@/features/auth/AreaGuard';

export default function OnboardingLayout() {
  return (
    <AreaGuard allowed={['driver']}>
      <Stack screenOptions={{ headerShown: false }} />
    </AreaGuard>
  );
}
