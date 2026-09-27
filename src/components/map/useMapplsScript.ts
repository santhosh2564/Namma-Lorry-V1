import { useEffect, useState } from 'react';

export type ScriptStatus = 'no-key' | 'loading' | 'ready' | 'error';

let loader: Promise<void> | null = null;

/** Loads the Mappls Web SDK v3 once per page (https://sdk.mappls.com/map/sdk/web?v=3.0&access_token=<static key>). */
export function loadMapplsSdk(key: string, timeoutMs = 15_000): Promise<void> {
  if (typeof window !== 'undefined' && (window as { mappls?: unknown }).mappls) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://sdk.mappls.com/map/sdk/web?v=3.0&access_token=${encodeURIComponent(key)}`;
    s.async = true;
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    s.onload = () => {
      clearTimeout(timer);
      if ((window as { mappls?: unknown }).mappls) resolve();
      else reject(new Error('mappls global missing'));
    };
    s.onerror = () => {
      clearTimeout(timer);
      reject(new Error('script failed'));
    };
    document.head.appendChild(s);
  }).catch((e) => {
    loader = null; // allow a retry on the next mount
    throw e;
  });
  return loader;
}

export function useMapplsScript(key: string | undefined): ScriptStatus {
  const [status, setStatus] = useState<ScriptStatus>(key ? 'loading' : 'no-key');
  useEffect(() => {
    if (!key) return;
    let alive = true;
    loadMapplsSdk(key).then(
      () => alive && setStatus('ready'),
      () => alive && setStatus('error'),
    );
    return () => {
      alive = false;
    };
  }, [key]);
  return status;
}
