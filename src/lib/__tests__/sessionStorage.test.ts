import {
  CHUNK_SIZE,
  createChunkedSecureStorage,
  createWebStorage,
  type SecureStoreLike,
} from '../sessionStorage';

function fakeSecureStore() {
  const data = new Map<string, string>();
  const store: SecureStoreLike = {
    getItemAsync: async (key) => data.get(key) ?? null,
    setItemAsync: async (key, value) => {
      if (value.length > 2048) throw new Error('SecureStore value too large');
      data.set(key, value);
    },
    deleteItemAsync: async (key) => void data.delete(key),
  };
  return { data, store };
}

describe('createChunkedSecureStorage', () => {
  it('round-trips a session larger than the SecureStore value limit', async () => {
    const { data, store } = fakeSecureStore();
    const storage = createChunkedSecureStorage(store);
    const session = JSON.stringify({ access_token: 'x'.repeat(4000), refresh_token: 'r' });
    await storage.setItem('sb-auth-token', session);
    expect(await storage.getItem('sb-auth-token')).toBe(session);
    expect(data.get('sb-auth-token__n')).toBe(String(Math.ceil(session.length / CHUNK_SIZE)));
  });

  it('removes leftover chunks when a value shrinks, and everything on remove', async () => {
    const { data, store } = fakeSecureStore();
    const storage = createChunkedSecureStorage(store);
    await storage.setItem('k', 'a'.repeat(CHUNK_SIZE * 3));
    await storage.setItem('k', 'short');
    expect(await storage.getItem('k')).toBe('short');
    expect([...data.keys()].sort()).toEqual(['k__0', 'k__n']);
    await storage.removeItem('k');
    expect(data.size).toBe(0);
    expect(await storage.getItem('k')).toBeNull();
  });

  it('returns null (signed out) for a torn write instead of a corrupt session', async () => {
    const { data, store } = fakeSecureStore();
    const storage = createChunkedSecureStorage(store);
    await storage.setItem('k', 'a'.repeat(CHUNK_SIZE * 2));
    data.delete('k__1');
    expect(await storage.getItem('k')).toBeNull();
  });
});

describe('createWebStorage', () => {
  it('falls back to memory when localStorage is unavailable', async () => {
    const original = window.localStorage;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('blocked');
      },
    });
    try {
      const storage = createWebStorage();
      await storage.setItem('k', 'v');
      expect(await storage.getItem('k')).toBe('v');
      await storage.removeItem('k');
      expect(await storage.getItem('k')).toBeNull();
    } finally {
      Object.defineProperty(window, 'localStorage', { configurable: true, value: original });
    }
  });
});
