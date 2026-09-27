// Storage adapters for the Supabase auth session.
// Native: expo-secure-store (Keychain / Keystore). SecureStore values should stay
// under ~2 KB, and a Supabase session is often larger, so values are split into chunks.
// Web: localStorage when it is actually usable, otherwise an in-memory fallback
// (private mode, SSR/static render, storage disabled).

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface SecureStoreLike {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export const CHUNK_SIZE = 1800;

/** SecureStore keys may only contain alphanumerics, ".", "-" and "_". */
export function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

export function createChunkedSecureStorage(store: SecureStoreLike, chunkSize = CHUNK_SIZE): KeyValueStore {
  const countKey = (k: string) => `${safeKey(k)}.n`;
  const chunkKey = (k: string, i: number) => `${safeKey(k)}.${i}`;

  async function removeChunks(key: string) {
    const n = Number(await store.getItemAsync(countKey(key))) || 0;
    for (let i = 0; i < n; i++) await store.deleteItemAsync(chunkKey(key, i));
    await store.deleteItemAsync(countKey(key));
  }

  return {
    async getItem(key) {
      const raw = await store.getItemAsync(countKey(key));
      if (raw === null) return null;
      const n = Number(raw);
      const parts: string[] = [];
      for (let i = 0; i < n; i++) {
        const part = await store.getItemAsync(chunkKey(key, i));
        if (part === null) return null; // partial write: treat as signed out
        parts.push(part);
      }
      return parts.join('');
    },
    async setItem(key, value) {
      await removeChunks(key);
      const n = Math.max(1, Math.ceil(value.length / chunkSize));
      for (let i = 0; i < n; i++) {
        await store.setItemAsync(chunkKey(key, i), value.slice(i * chunkSize, (i + 1) * chunkSize));
      }
      // Count last, so a crash mid-write never exposes a truncated session.
      await store.setItemAsync(countKey(key), String(n));
    },
    async removeItem(key) {
      await removeChunks(key);
    },
  };
}

export function createMemoryStorage(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: async (k) => map.get(k) ?? null,
    setItem: async (k, v) => void map.set(k, v),
    removeItem: async (k) => void map.delete(k),
  };
}

function usableLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const probe = '__nl_probe__';
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function createWebStorage(): KeyValueStore {
  const memory = createMemoryStorage();
  return {
    async getItem(k) {
      const ls = usableLocalStorage();
      return ls ? ls.getItem(k) : memory.getItem(k);
    },
    async setItem(k, v) {
      const ls = usableLocalStorage();
      if (!ls) return memory.setItem(k, v);
      try {
        ls.setItem(k, v);
      } catch {
        await memory.setItem(k, v); // quota exceeded
      }
    },
    async removeItem(k) {
      usableLocalStorage()?.removeItem(k);
      await memory.removeItem(k);
    },
  };
}
