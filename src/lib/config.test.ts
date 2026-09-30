import { config, resolveConfig, resolveSupabaseKey, type ConfigProblem } from "./config";

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

describe("resolveConfig (validation M2: fail closed outside development)", () => {
  const URL_OK = "https://project.supabase.co";
  const KEY_OK = "sb_publishable_key";
  const keys = (problems: ConfigProblem[]) => problems.map((p) => `${p.key}:${p.reason}`);

  describe("development", () => {
    it("tolerates a missing backend (sign-in says unavailable, as today)", () => {
      const { config: c, problems } = resolveConfig({ EXPO_PUBLIC_APP_ENV: "development" }, true);
      expect(problems).toEqual([]);
      expect(c.appEnv).toBe("development");
      expect(c.supabaseUrl).toBe("");
    });

    it("defaults an unset APP_ENV to development in a dev bundle", () => {
      expect(resolveConfig({}, true).config.appEnv).toBe("development");
    });

    it("allows the local http stack", () => {
      const { config: c, problems } = resolveConfig(
        {
          EXPO_PUBLIC_APP_ENV: "development",
          EXPO_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
          EXPO_PUBLIC_SUPABASE_ANON_KEY: KEY_OK,
        },
        true,
      );
      expect(problems).toEqual([]);
      expect(c.supabaseUrl).toBe("http://127.0.0.1:54321");
    });

    it("flags an unknown APP_ENV (the module throws on it in development)", () => {
      expect(keys(resolveConfig({ EXPO_PUBLIC_APP_ENV: "prod" }, true).problems)).toEqual([
        "EXPO_PUBLIC_APP_ENV:invalid",
      ]);
    });
  });

  describe.each(["staging", "production"] as const)("%s", (appEnv) => {
    it("passes a valid https backend through", () => {
      const { config: c, problems } = resolveConfig(
        {
          EXPO_PUBLIC_APP_ENV: appEnv,
          EXPO_PUBLIC_SUPABASE_URL: URL_OK,
          EXPO_PUBLIC_SUPABASE_ANON_KEY: KEY_OK,
        },
        false,
      );
      expect(problems).toEqual([]);
      expect(c).toMatchObject({ appEnv, supabaseUrl: URL_OK, supabaseAnonKey: KEY_OK });
    });

    it("accepts the dashboard's EXPO_PUBLIC_SUPABASE_KEY name", () => {
      const { problems } = resolveConfig(
        {
          EXPO_PUBLIC_APP_ENV: appEnv,
          EXPO_PUBLIC_SUPABASE_URL: URL_OK,
          EXPO_PUBLIC_SUPABASE_KEY: KEY_OK,
        },
        false,
      );
      expect(problems).toEqual([]);
    });

    it("is misconfigured when the backend is missing, with no fallback URL", () => {
      const { config: c, problems } = resolveConfig({ EXPO_PUBLIC_APP_ENV: appEnv }, false);
      expect(keys(problems)).toEqual([
        "EXPO_PUBLIC_SUPABASE_URL:missing",
        "EXPO_PUBLIC_SUPABASE_ANON_KEY:missing",
      ]);
      expect(c.appEnv).toBe(appEnv);
      expect(c.supabaseUrl).toBe("");
      expect(c.supabaseAnonKey).toBe("");
    });

    it("rejects a URL that does not parse", () => {
      const { config: c, problems } = resolveConfig(
        {
          EXPO_PUBLIC_APP_ENV: appEnv,
          EXPO_PUBLIC_SUPABASE_URL: "project.supabase",
          EXPO_PUBLIC_SUPABASE_ANON_KEY: KEY_OK,
        },
        false,
      );
      expect(keys(problems)).toEqual(["EXPO_PUBLIC_SUPABASE_URL:invalid"]);
      expect(c.supabaseUrl).toBe("");
      expect(c.supabaseAnonKey).toBe("");
    });

    it("rejects an http:// backend (docs/09 §4 HTTPS only)", () => {
      const { config: c, problems } = resolveConfig(
        {
          EXPO_PUBLIC_APP_ENV: appEnv,
          EXPO_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
          EXPO_PUBLIC_SUPABASE_ANON_KEY: KEY_OK,
        },
        false,
      );
      expect(keys(problems)).toEqual(["EXPO_PUBLIC_SUPABASE_URL:insecure"]);
      expect(c.supabaseUrl).toBe("");
    });

    it("reports key names only, never values", () => {
      const { problems } = resolveConfig(
        {
          EXPO_PUBLIC_APP_ENV: appEnv,
          EXPO_PUBLIC_SUPABASE_URL: "http://leaky.example.com",
          EXPO_PUBLIC_SUPABASE_ANON_KEY: "",
        },
        false,
      );
      expect(JSON.stringify(problems)).not.toContain("leaky");
    });

    it("keeps the Sentry DSN so the failure can still be reported", () => {
      const dsn = "https://k@o1.ingest.sentry.io/1";
      const { config: c } = resolveConfig(
        { EXPO_PUBLIC_APP_ENV: appEnv, EXPO_PUBLIC_SENTRY_DSN: dsn },
        false,
      );
      expect(c.sentryDsn).toBe(dsn);
    });
  });

  describe("privacy-policy URL (D1 link)", () => {
    it("passes EXPO_PUBLIC_PRIVACY_POLICY_URL through", () => {
      const url = "https://nammalorry.example/privacy";
      const { config: c, problems } = resolveConfig(
        {
          EXPO_PUBLIC_APP_ENV: "production",
          EXPO_PUBLIC_SUPABASE_URL: URL_OK,
          EXPO_PUBLIC_SUPABASE_ANON_KEY: KEY_OK,
          EXPO_PUBLIC_PRIVACY_POLICY_URL: url,
        },
        false,
      );
      expect(c.privacyPolicyUrl).toBe(url);
      expect(problems).toEqual([]);
    });

    it("is empty while unset (D1 hides the link; publishing the policy is a human item)", () => {
      const { config: c } = resolveConfig({ EXPO_PUBLIC_APP_ENV: "development" }, true);
      expect(c.privacyPolicyUrl).toBe("");
    });
  });

  describe("release bundle (__DEV__ false)", () => {
    it("treats a missing APP_ENV as a misconfigured production build, not development", () => {
      const { config: c, problems } = resolveConfig(
        { EXPO_PUBLIC_SUPABASE_URL: URL_OK, EXPO_PUBLIC_SUPABASE_ANON_KEY: KEY_OK },
        false,
      );
      expect(c.appEnv).toBe("production");
      expect(keys(problems)).toEqual(["EXPO_PUBLIC_APP_ENV:missing"]);
      expect(c.supabaseUrl).toBe("");
    });

    it("treats an unknown APP_ENV as a misconfigured production build", () => {
      const { config: c, problems } = resolveConfig(
        {
          EXPO_PUBLIC_APP_ENV: "preview",
          EXPO_PUBLIC_SUPABASE_URL: URL_OK,
          EXPO_PUBLIC_SUPABASE_ANON_KEY: KEY_OK,
        },
        false,
      );
      expect(c.appEnv).toBe("production");
      expect(keys(problems)).toEqual(["EXPO_PUBLIC_APP_ENV:invalid"]);
    });
  });
});
