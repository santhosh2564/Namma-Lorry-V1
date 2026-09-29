import * as SecureStore from "expo-secure-store";

import type { AppConfig } from "@/lib/config";
import {
  isConfigured,
  secureStoreSessionStorage,
  supabase,
  supabaseCredentials,
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

describe("isConfigured", () => {
  // The gate the whole app branches on, as a pure function of two strings — so
  // it can be asserted here whatever the ambient environment holds. The sandbox
  // now has real credentials in `.env.local`; CI has none. Both must be able to
  // test the same decision.
  it("needs both a URL and a key", () => {
    expect(isConfigured("https://project.supabase.co", "sb_publishable_key")).toBe(true);
  });

  it("is false when either half is missing", () => {
    expect(isConfigured("", "key")).toBe(false);
    expect(isConfigured("https://project.supabase.co", "")).toBe(false);
    expect(isConfigured("", "")).toBe(false);
  });
});

describe("supabase client", () => {
  it("constructs without throwing, configured or not", () => {
    // config.ts tolerates empty EXPO_PUBLIC_SUPABASE_* so the scaffold runs, and
    // an unconfigured build gets a placeholder URL instead of a crash while the
    // module is being imported (M5). Importing it in a test must not blow up
    // either.
    expect(supabase).toBeDefined();
    expect(supabase.auth).toBeDefined();
    expect(typeof supabase.from).toBe("function");
  });

  it("is typed against the Phase 1 schema", () => {
    // Compile-time: with the untyped default, a bad table or column name would
    // not be a type error. The builder is deliberately not awaited — whether the
    // request reaches a project is an environment fact, and a unit test must not
    // depend on a reachable backend.
    const query = supabase
      .from("trips")
      .select("id, status")
      .eq("id", "00000000-0000-0000-0000-000000000000");

    expect(typeof query.then).toBe("function");
  });
});

describe("supabaseCredentials (validation M2)", () => {
  const configured = { supabaseUrl: "https://project.supabase.co", supabaseAnonKey: "key" };
  const empty = { supabaseUrl: "", supabaseAnonKey: "" };

  it.each(["development", "staging", "production"] as const)(
    "%s: uses the configured project",
    (appEnv) => {
      expect(supabaseCredentials({ appEnv, ...configured })).toEqual({
        url: "https://project.supabase.co",
        key: "key",
      });
    },
  );

  it("development: an unconfigured build keeps the loud local placeholder", () => {
    expect(supabaseCredentials({ appEnv: "development", ...empty })?.url).toBe(
      "http://127.0.0.1:54321",
    );
  });

  it.each(["staging", "production"] as const)(
    "%s: never falls back to localhost, no credentials at all",
    (appEnv) => {
      expect(supabaseCredentials({ appEnv, ...empty })).toBeNull();
    },
  );
});

describe("supabase client in a misconfigured release", () => {
  it("is never created, and any use fails loudly instead of reaching a guessed backend", () => {
    const createClient = jest.fn();
    let loaded: typeof import("@/lib/supabase") | undefined;
    jest.isolateModules(() => {
      jest.doMock("@supabase/supabase-js", () => ({ createClient }));
      jest.doMock("@/lib/config", () => {
        const config: Partial<AppConfig> = {
          appEnv: "production",
          supabaseUrl: "",
          supabaseAnonKey: "",
        };
        return { config };
      });
      loaded = jest.requireActual<typeof import("@/lib/supabase")>("@/lib/supabase");
    });

    expect(createClient).not.toHaveBeenCalled();
    expect(loaded!.isSupabaseConfigured).toBe(false);
    expect(() => loaded!.supabase.from("trips")).toThrow(/not configured/);
  });
});
