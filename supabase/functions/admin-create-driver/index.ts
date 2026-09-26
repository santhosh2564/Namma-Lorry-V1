import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseContext } from '../_shared/auth.ts';
import { type AdminApi, createHandler, type DriverProfile } from './handler.ts';

/** Privileged operations on ctx.supabaseAdmin (secret key; never sent to the app). */
function adminApi(sb: SupabaseClient): AdminApi {
  return {
    async createUser(phone) {
      const { data, error } = await sb.auth.admin.createUser({ phone, phone_confirm: true });
      if (error || !data.user) {
        return { errorCode: error?.code ?? 'unknown', message: error?.message ?? 'no user' };
      }
      return { id: data.user.id };
    },
    async deleteUser(id) {
      await sb.auth.admin.deleteUser(id);
    },
    async setDriverProfile(id, fields) {
      const { data, error } = await sb
        .from('profiles')
        .update({ ...fields, role: 'driver', is_active: true })
        .eq('id', id)
        .select('id, role, full_name, phone, preferred_language, is_active, created_at')
        .single();
      if (error || !data) {
        return { errorCode: error?.code ?? 'not_found', message: error?.message ?? 'no profile' };
      }
      return data as DriverProfile;
    },
  };
}

export default { fetch: createHandler({ makeContext: supabaseContext(adminApi) }) };
