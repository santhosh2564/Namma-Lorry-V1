import { config, resolveSupabaseKey } from "./config";

describe("config", () => {
  it("exposes appEnv and never throws for the M1 defaults", () => {
    expect(["development", "staging", "production"]).toContain(config.appEnv);
  });

  it("keeps server-only secrets out of the client config", () => {
    const serialized = JSON.stringify(config);
    expect(serialized).not.toMatch(/SERVICE_ROLE|CLIENT_SECRET|REST_KEY/i);
  });
});

describe("resolveSupabaseKey", () => {
  // This repo calls the browser-safe key `…_ANON_KEY`, but Supabase's RN
  // quickstart calls it `EXPO_PUBLIC_SUPABASE_KEY`. Both must work.
  it("prefers the anon-key name", () => {
    expect(
      resolveSupabaseKey({
        EXPO_PUBLIC_SUPABASE_ANON_KEY: "anon",
        EXPO_PUBLIC_SUPABASE_KEY: "publishable",
      }),
    ).toBe("anon");
  });

  it("falls back to the dashboard's publishable-key name", () => {
    expect(resolveSupabaseKey({ EXPO_PUBLIC_SUPABASE_KEY: "publishable" })).toBe("publishable");
  });

  it("is empty when neither is set", () => {
    expect(resolveSupabaseKey({})).toBe("");
  });

  it("treats an empty anon key as unset", () => {
    expect(
      resolveSupabaseKey({ EXPO_PUBLIC_SUPABASE_ANON_KEY: "", EXPO_PUBLIC_SUPABASE_KEY: "p" }),
    ).toBe("p");
  });
});
