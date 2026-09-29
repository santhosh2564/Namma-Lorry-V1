import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

import { config } from './config';
import { createChunkedSecureStorage, createWebStorage } from './sessionStorage';

/**
 * Supabase client. Session: expo-secure-store on native (chunked), localStorage-safe
 * storage on web (docs/09 §4). Null when no anon key is configured (dev demo mode).
 * TODO(M4): type with the generated Database from src/lib/database.types.ts.
 */
export const supabase: SupabaseClient | null = config.supabaseAnonKey
  ? createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        storage:
          Platform.OS === 'web' ? createWebStorage() : createChunkedSecureStorage(SecureStore),
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: Platform.OS === 'web',
      },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null;

// Native apps don't get browser visibility events: refresh tokens only while in the
// foreground (Supabase guidance for React Native).
if (supabase && Platform.OS !== 'web') {
  const client = supabase;
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void client.auth.startAutoRefresh();
    else void client.auth.stopAutoRefresh();
  });
}
