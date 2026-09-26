import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import { useAuthStore } from './store';

export const profileQueryKey = (userId: string | undefined) => ['profile', userId] as const;

export function useProfile() {
  const userId = useAuthStore((s) => s.session?.user.id);
  return useQuery({
    queryKey: profileQueryKey(userId),
    enabled: !!userId,
    queryFn: async () => {
      // RLS `profiles_self` limits this to the caller's own row.
      const { data, error } = await supabase
        .from('profiles')
        .select('id, role, full_name, phone, is_active, preferred_language, consent_version')
        .eq('id', userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
  });
}
