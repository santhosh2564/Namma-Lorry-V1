// Postgres changes over Supabase Realtime, made resilient (C1, C6):
// - every SUBSCRIBED (first join and every rejoin after a socket drop) calls `onResync`, so the
//   caller refetches and nothing missed while disconnected is lost;
// - CHANNEL_ERROR / TIMED_OUT / an unexpected CLOSED → drop the channel and subscribe again with
//   backoff; the network coming back resubscribes immediately.
// RLS applies to postgres_changes, so a client only receives rows it may select.
import NetInfo from '@react-native-community/netinfo';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useEffectEvent, useState } from 'react';

import { supabase } from './supabase';

export interface ChangeSpec {
  table: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  /** PostgREST-style filter, e.g. `trip_id=eq.<uuid>`. */
  filter?: string;
}

export type RealtimeStatus = 'connecting' | 'live' | 'retrying';

export interface ChangePayload {
  table: string;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown>;
  old: Record<string, unknown>;
}

export const RETRY_BASE_MS = 1_000;
export const RETRY_MAX_MS = 30_000;

/** 1 s, 2 s, 4 s … capped at 30 s. */
export function retryDelay(attempt: number): number {
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, attempt));
}

export interface RealtimeOptions {
  /** Unique per screen instance; changing it resubscribes. */
  name: string;
  changes: ChangeSpec[];
  enabled?: boolean;
  onChange: (p: ChangePayload) => void;
  onResync: () => void;
  /** Injected in tests. */
  client?: Pick<SupabaseClient, 'channel' | 'removeChannel'>;
}

export function useRealtimeChanges({
  name,
  changes,
  enabled = true,
  onChange,
  onResync,
  client = supabase,
}: RealtimeOptions): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>('connecting');
  const emitChange = useEffectEvent((p: ChangePayload) => onChange(p));
  const emitResync = useEffectEvent(() => onResync());
  const specKey = JSON.stringify(changes);

  useEffect(() => {
    if (!enabled) return;
    const specs = JSON.parse(specKey) as ChangeSpec[];
    let channel: RealtimeChannel | null = null;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let closedByUs = false;
    let generation = 0;

    const teardown = () => {
      if (channel) {
        const c = channel;
        channel = null;
        void client.removeChannel(c);
      }
    };

    const subscribe = () => {
      teardown();
      const gen = ++generation;
      let c = client.channel(`${name}:${gen}`);
      for (const spec of specs) {
        c = c.on(
          'postgres_changes' as never,
          { event: spec.event ?? '*', schema: 'public', table: spec.table, filter: spec.filter } as never,
          ((payload: ChangePayload) => emitChange(payload)) as never,
        );
      }
      channel = c;
      c.subscribe((s: string) => {
        if (closedByUs || gen !== generation) return;
        if (s === 'SUBSCRIBED') {
          attempt = 0;
          setStatus('live');
          emitResync();
        } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
          setStatus('retrying');
          if (timer) return;
          timer = setTimeout(() => {
            timer = null;
            attempt += 1;
            subscribe();
          }, retryDelay(attempt));
        }
      });
    };

    subscribe();

    // Network back: resubscribe now instead of waiting for the backoff.
    let wasOnline: boolean | null = null;
    const unsubscribeNet = NetInfo.addEventListener((st) => {
      const online = !!st.isConnected && st.isInternetReachable !== false;
      if (online && wasOnline === false) {
        if (timer) clearTimeout(timer);
        timer = null;
        attempt = 0;
        subscribe();
      }
      wasOnline = online;
    });

    return () => {
      closedByUs = true;
      if (timer) clearTimeout(timer);
      unsubscribeNet();
      teardown();
    };
  }, [name, specKey, enabled, client]);

  return enabled ? status : 'connecting';
}
