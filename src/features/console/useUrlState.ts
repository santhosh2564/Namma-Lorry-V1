import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';

/** Reads list filters from the URL and writes changes back (shareable links, back button works). */
export function useUrlState<K extends string>() {
  const params = useLocalSearchParams() as Partial<Record<K, string>>;
  const router = useRouter();
  const set = useCallback(
    (patch: Partial<Record<K, string | undefined>>) => router.setParams(patch as Record<string, string>),
    [router],
  );
  return [params, set] as const;
}

export const pick = <V extends string>(v: string | undefined, allowed: readonly V[], fallback: V): V =>
  (allowed as readonly string[]).includes(v ?? '') ? (v as V) : fallback;
