import {
  getClerkServerConfig,
  getDatabaseConfig,
  getEmailServerConfig,
  getR2Config,
  ServerConfigError,
} from "./config";

describe("server config", () => {
  it("reads DATABASE_URL and names it when missing", () => {
    expect(getDatabaseConfig({ DATABASE_URL: "postgres://u:p@host/db" })).toEqual({
      databaseUrl: "postgres://u:p@host/db",
    });
    expect(() => getDatabaseConfig({})).toThrow(ServerConfigError);
    expect(() => getDatabaseConfig({})).toThrow("DATABASE_URL");
  });

  it("reads both Clerk server values and names the missing one", () => {
    expect(
      getClerkServerConfig({ CLERK_SECRET_KEY: "sk_test_x", CLERK_PUBLISHABLE_KEY: "pk_test_x" }),
    ).toEqual({ secretKey: "sk_test_x", publishableKey: "pk_test_x" });
    expect(() => getClerkServerConfig({ CLERK_SECRET_KEY: "sk_test_x" })).toThrow(
      "CLERK_PUBLISHABLE_KEY",
    );
  });

  it("derives the R2 endpoint from the account id when not set", () => {
    const base = {
      R2_ACCOUNT_ID: "acct123",
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET_NAME: "pod-evidence",
    };
    expect(getR2Config(base).endpoint).toBe("https://acct123.r2.cloudflarestorage.com");
    expect(getR2Config({ ...base, R2_ENDPOINT: "https://custom.example" }).endpoint).toBe(
      "https://custom.example",
    );
  });

  it("names each missing R2 variable in turn", () => {
    expect(() => getR2Config({})).toThrow("R2_ACCOUNT_ID");
    expect(() => getR2Config({ R2_ACCOUNT_ID: "a" })).toThrow("R2_ACCESS_KEY_ID");
  });

  it("reads the email config the same way the email module expects", () => {
    expect(
      getEmailServerConfig({ RESEND_API_KEY: "re_x", EMAIL_FROM: "Namma Lorry <a@b.com>" }),
    ).toEqual({ apiKey: "re_x", from: "Namma Lorry <a@b.com>" });
  });

  it("never includes a value in the error message", () => {
    try {
      getDatabaseConfig({ DATABASE_URL: "   " });
      throw new Error("expected to throw");
    } catch (error) {
      expect(String(error)).not.toContain("   ");
      expect(String(error)).toContain("DATABASE_URL");
    }
  });
});
