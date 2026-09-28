import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { config } from './config';

export const supabase: SupabaseClient | null = config.supabaseAnonKey
  ? createClient(config.supabaseUrl, config.supabaseAnonKey, {
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null;

