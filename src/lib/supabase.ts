import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

import { config } from './config';
import type { Database } from './database.types';
import { createChunkedSecureStorage, createWebStorage } from './sessionStorage';

const isWeb = Platform.OS === 'web';

export const supabase = createClient<Database>(
  config.EXPO_PUBLIC_SUPABASE_URL,
  config.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      storage: isWeb ? createWebStorage() : createChunkedSecureStorage(SecureStore),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // phone OTP only, no redirect-based flows
    },
  },
);

// On native, refresh tokens only while the app is in the foreground
// (https://supabase.com/docs/reference/javascript/auth-startautorefresh).
if (!isWeb) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
