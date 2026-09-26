import { createChunkedSecureStorage, createMemoryStorage, safeKey, type SecureStoreLike } from './sessionStorage';

function fakeSecureStore() {
  const map = new Map<string, string>();
  const store: SecureStoreLike = {
    getItemAsync: async (k) => {
      if (!/^[A-Za-z0-9._-]+$/.test(k)) throw new Error(`invalid key ${k}`);
      return map.get(k) ?? null;
    },
    setItemAsync: async (k, v) => {
      if (v.length > 2048) throw new Error('too large');
      map.set(k, v);
    },
    deleteItemAsync: async (k) => void map.delete(k),
  };
  return { store, map };
}

describe('createChunkedSecureStorage', () => {
  it('round-trips a value larger than the SecureStore limit', async () => {
    const { store, map } = fakeSecureStore();
    const s = createChunkedSecureStorage(store, 1000);
    const big = 'x'.repeat(4500);
    await s.setItem('sb-local-auth-token', big);
    expect(await s.getItem('sb-local-auth-token')).toBe(big);
    expect(map.get('sb-local-auth-token.n')).toBe('5');
  });

  it('removes stale chunks when a shorter value is written', async () => {
    const { store, map } = fakeSecureStore();
    const s = createChunkedSecureStorage(store, 10);
    await s.setItem('k', 'a'.repeat(35));
    await s.setItem('k', 'short');
    expect(await s.getItem('k')).toBe('short');
    expect([...map.keys()].sort()).toEqual(['k.0', 'k.n']);
  });

  it('returns null for missing or partially written values, and removes everything', async () => {
    const { store, map } = fakeSecureStore();
    const s = createChunkedSecureStorage(store, 10);
    expect(await s.getItem('k')).toBeNull();
    await s.setItem('k', 'a'.repeat(25));
    map.delete('k.1');
    expect(await s.getItem('k')).toBeNull();
    await s.removeItem('k');
    expect(map.size).toBe(0);
  });

  it('sanitises keys SecureStore would reject', async () => {
    expect(safeKey('sb:auth/token')).toBe('sb_auth_token');
    const { store } = fakeSecureStore();
    const s = createChunkedSecureStorage(store);
    await s.setItem('sb:auth/token', 'v');
    expect(await s.getItem('sb:auth/token')).toBe('v');
  });
});

describe('createMemoryStorage', () => {
  it('stores and removes', async () => {
    const m = createMemoryStorage();
    await m.setItem('a', '1');
    expect(await m.getItem('a')).toBe('1');
    await m.removeItem('a');
    expect(await m.getItem('a')).toBeNull();
  });
});
