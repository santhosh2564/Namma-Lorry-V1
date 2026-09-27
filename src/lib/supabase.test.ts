import * as SecureStore from "expo-secure-store";

import {
  isSupabaseConfigured,
  secureStoreSessionStorage,
  supabase,
  webSessionStorage,
} from "@/lib/supabase";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const secureStoreMock = jest.mocked(SecureStore);

/** Minimal in-memory `Storage`, plus the "throwing" flavour browsers use. */
function fakeLocalStorage(options: { throws?: boolean } = {}): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => {
      map.delete(key);
    },
    setItem: (key, value) => {
      if (options.throws) throw new Error("QuotaExceededError");
      map.set(key, value);
    },
  } as Storage;
}

describe("secureStoreSessionStorage (native)", () => {
  it("reads, writes and deletes through expo-secure-store", async () => {
    secureStoreMock.getItemAsync.mockResolvedValue("session");
    secureStoreMock.setItemAsync.mockResolvedValue(undefined);
    secureStoreMock.deleteItemAsync.mockResolvedValue(undefined);

    await expect(secureStoreSessionStorage.getItem("k")).resolves.toBe("session");
    await expect(secureStoreSessionStorage.setItem("k", "v")).resolves.toBe(undefined);
    await expect(secureStoreSessionStorage.removeItem("k")).resolves.toBe(undefined);

    expect(secureStoreMock.getItemAsync).toHaveBeenCalledWith("k");
    expect(secureStoreMock.setItemAsync).toHaveBeenCalledWith("k", "v");
    expect(secureStoreMock.deleteItemAsync).toHaveBeenCalledWith("k");
  });
});

describe("webSessionStorage", () => {
  const original = globalThis.localStorage;

  afterEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: original,
      writable: true,
    });
  });

  function setLocalStorage(value: Storage | undefined) {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value,
      writable: true,
    });
  }

  it("round-trips a session through localStorage", () => {
    setLocalStorage(fakeLocalStorage());

    webSessionStorage.setItem("k", "v");
    expect(webSessionStorage.getItem("k")).toBe("v");

    webSessionStorage.removeItem("k");
    expect(webSessionStorage.getItem("k")).toBeNull();
  });

  it("reads as signed out when there is no localStorage at all", () => {
    setLocalStorage(undefined);
    expect(webSessionStorage.getItem("k")).toBeNull();
  });

  it("never throws when the browser refuses to persist", () => {
    setLocalStorage(fakeLocalStorage({ throws: true }));

    // A session we cannot save costs one extra sign-in, not a crash.
    expect(() => webSessionStorage.setItem("k", "v")).not.toThrow();
    expect(() => webSessionStorage.removeItem("k")).not.toThrow();
  });
});

describe("supabase client", () => {
  it("is constructed even when Supabase is not configured", () => {
    // config.ts tolerates empty EXPO_PUBLIC_SUPABASE_* so the scaffold runs;
    // importing this module in a test must not blow up.
    expect(isSupabaseConfigured).toBe(false);
    expect(supabase).toBeDefined();
  });

  it("is typed against the Phase 1 schema", async () => {
    // Compile-time only: if Database were the untyped `any` default, a bad
    // table or column name would not be a type error.
    const { data, error } = await supabase
      .from("trips")
      .select("id, status")
      .eq("id", "00000000-0000-0000-0000-000000000000");

    // The test env has no reachable Supabase, so a transport error is the
    // expected outcome — what matters is that the query typechecked.
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});
