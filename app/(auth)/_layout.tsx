import { Stack } from 'expo-router';

import { AreaGuard } from '@/features/auth/AreaGuard';

export default function AuthLayout() {
  return (
    <AreaGuard allowed={['auth']}>
      <Stack screenOptions={{ headerShown: false }} />
    </AreaGuard>
  );
}
