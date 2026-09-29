/**
 * Auth session storage for supabase-js (docs/09 §4 "Session: expo-secure-store on native").
 *
 * Native: expo-secure-store (Keychain / Keystore). A Supabase session JSON is often
 * larger than SecureStore's ~2 KB per-value limit, so values are split into chunks:
 * `<key>__n` holds the chunk count and `<key>__0…` the parts.
 * Web: localStorage when it is usable; otherwise (static rendering in Node, private
 * mode, blocked storage) an in-memory map so the app still runs, just without persistence.
 */
export type AsyncKeyValue = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export type SecureStoreLike = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

export const CHUNK_SIZE = 1800;

export function createChunkedSecureStorage(store: SecureStoreLike): AsyncKeyValue {
  const countKey = (key: string) => `${key}__n`;
  const chunkKey = (key: string, index: number) => `${key}__${index}`;

  const readCount = async (key: string) => {
    const raw = await store.getItemAsync(countKey(key));
    const count = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(count) && count > 0 ? count : 0;
  };

  const removeChunks = async (key: string, from: number, to: number) => {
    for (let index = from; index < to; index += 1)
      await store.deleteItemAsync(chunkKey(key, index));
  };

  return {
    async getItem(key) {
      const count = await readCount(key);
      if (count === 0) return null;
      const parts: string[] = [];
      for (let index = 0; index < count; index += 1) {
        const part = await store.getItemAsync(chunkKey(key, index));
        if (part === null) return null; // torn write: treat as signed out rather than corrupt
        parts.push(part);
      }
      return parts.join('');
    },
    async setItem(key, value) {
      const previous = await readCount(key);
      const chunks = value.match(new RegExp(`[\\s\\S]{1,${CHUNK_SIZE}}`, 'g')) ?? [''];
      for (const [index, chunk] of chunks.entries())
        await store.setItemAsync(chunkKey(key, index), chunk);
      await store.setItemAsync(countKey(key), String(chunks.length));
      await removeChunks(key, chunks.length, previous);
    },
    async removeItem(key) {
      const count = await readCount(key);
      await store.deleteItemAsync(countKey(key));
      await removeChunks(key, 0, count);
    },
  };
}

export function createWebStorage(): AsyncKeyValue {
  const memory = new Map<string, string>();
  const local = (() => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      const probe = '__nl_probe__';
      window.localStorage.setItem(probe, probe);
      window.localStorage.removeItem(probe);
      return window.localStorage;
    } catch {
      return null;
    }
  })();

  return {
    async getItem(key) {
      return local ? local.getItem(key) : (memory.get(key) ?? null);
    },
    async setItem(key, value) {
      if (local) local.setItem(key, value);
      else memory.set(key, value);
    },
    async removeItem(key) {
      if (local) local.removeItem(key);
      else memory.delete(key);
    },
  };
}
