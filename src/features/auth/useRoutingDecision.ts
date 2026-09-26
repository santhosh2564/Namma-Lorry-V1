import { useQuery } from '@tanstack/react-query';
import { Platform } from 'react-native';

import { getLocalTripState } from '@/tracking/localState';
import { checkTrackingPermissions } from '@/tracking/permissions';

import { decideRoute, type Destination, type Loadable } from './routing';
import { useAuthStore } from './store';
import { useProfile } from './useProfile';

function toLoadable<T>(q: { status: 'pending' | 'error' | 'success'; data: T | undefined }): Loadable<T> {
  if (q.status === 'pending') return { status: 'loading' };
  if (q.status === 'error') return { status: 'error' };
  return { status: 'ready', value: q.data as T };
}

export const localTripQueryKey = ['tracking', 'local-state'] as const;

/** Gathers auth, profile and device state and feeds the pure `decideRoute`. */
export function useRoutingDecision(): { destination: Destination; refetch: () => void } {
  const native = Platform.OS !== 'web';
  const auth = useAuthStore((s) => s.status);
  const profile = useProfile();
  const isDriver = profile.data?.role === 'driver';

  const localTrip = useQuery({ queryKey: localTripQueryKey, queryFn: getLocalTripState, enabled: native });
  const permissions = useQuery({
    queryKey: ['tracking', 'permissions'],
    queryFn: checkTrackingPermissions,
    enabled: native && isDriver,
  });

  const destination = decideRoute({
    platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
    localTrip: toLoadable(localTrip),
    auth,
    profile:
      profile.status === 'pending'
        ? { status: 'loading' }
        : profile.status === 'error'
          ? { status: 'error' }
          : {
              status: 'ready',
              value: profile.data ? { role: profile.data.role, isActive: profile.data.is_active } : null,
            },
    permissions: toLoadable(permissions),
  });

  return {
    destination,
    refetch: () => {
      void profile.refetch();
      if (native) void localTrip.refetch();
    },
  };
}
