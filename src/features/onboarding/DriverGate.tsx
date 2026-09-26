import { useQueryClient } from '@tanstack/react-query';
import { Redirect } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { localTripQueryKey, useRoutingDecision } from '@/features/auth/useRoutingDecision';
import { permissionsQueryKey } from '@/tracking/permissions';

/** Re-reads permissions and the local trip whenever the app comes back to the foreground. */
export function usePermissionRecheck() {
  const qc = useQueryClient();
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      void qc.invalidateQueries({ queryKey: permissionsQueryKey });
      void qc.invalidateQueries({ queryKey: localTripQueryKey });
    });
    return () => sub.remove();
  }, [qc]);
}

/**
 * Driver tabs and trip screens: if precise/"all the time" location (or consent) is lost
 * while the app was in the background, go back to D1. An active trip keeps its screen:
 * the routing decision resumes it first, and D5 shows the tracking-problem banner (M10).
 */
export function DriverGate({ children }: { children: ReactNode }) {
  usePermissionRecheck();
  const { destination } = useRoutingDecision();
  if (destination.kind === 'onboarding') return <Redirect href="/permissions" />;
  return <>{children}</>;
}
