import type { QueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { getLocalTripState } from '@/tracking/localState';

import { useAuthStore } from './store';

export type SignOutResult = { ok: true } | { ok: false; reason: 'TRIP_ACTIVE' | 'TRIP_UNSYNCED' };

/**
 * Sign-out is refused while a trip is active on this device (docs/04 D6/D8), and while trip
 * data is still waiting to upload: uploads need this driver's session (RLS), so signing out
 * would strand the points.
 */
export async function signOut(queryClient: QueryClient): Promise<SignOutResult> {
  const local = await getLocalTripState();
  if (local.activeTripId) return { ok: false, reason: 'TRIP_ACTIVE' };
  if (local.unsyncedTripId || local.pendingPoints > 0) return { ok: false, reason: 'TRIP_UNSYNCED' };
  // Local scope: end this device's session even if the network is down.
  await supabase.auth.signOut({ scope: 'local' });
  useAuthStore.getState().clearPending();
  queryClient.clear();
  return { ok: true };
}
