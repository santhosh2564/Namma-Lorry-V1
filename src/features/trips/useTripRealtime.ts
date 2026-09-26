import { useEffect } from 'react';

import { supabase } from '@/lib/supabase';

/**
 * Calls `onChange` when the trip row changes on the server (0004 puts `trips` in the realtime
 * publication; RLS limits a driver to their own trips). D6 also polls while unsettled, so a
 * dropped socket only makes the update slower, never missing.
 */
export function useTripRealtime(tripId: string, enabled: boolean, onChange: () => void) {
  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel(`trip-summary-${tripId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'trips', filter: `id=eq.${tripId}` },
        () => onChange(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // onChange is a refetch; resubscribing on every render would drop events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, enabled]);
}
