import type { QueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { getLocalTripState } from '@/tracking/localState';

import { useAuthStore } from './store';

export type SignOutResult = { ok: true } | { ok: false; reason: 'TRIP_ACTIVE' };

/** Sign-out is refused while a trip is active on this device (docs/04 D6/D8). */
export async function signOut(queryClient: QueryClient): Promise<SignOutResult> {
  const { activeTripId } = await getLocalTripState();
  if (activeTripId) return { ok: false, reason: 'TRIP_ACTIVE' };
  // Local scope: end this device's session even if the network is down.
  await supabase.auth.signOut({ scope: 'local' });
  useAuthStore.getState().clearPending();
  queryClient.clear();
  return { ok: true };
}
