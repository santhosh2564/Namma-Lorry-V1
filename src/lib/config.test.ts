import { config } from "./config";

describe("config", () => {
  it("exposes appEnv and never throws for the M1 defaults", () => {
    expect(["development", "staging", "production"]).toContain(config.appEnv);
  });

  it("keeps server-only secrets out of the client config", () => {
    const serialized = JSON.stringify(config);
    expect(serialized).not.toMatch(/SERVICE_ROLE|CLIENT_SECRET|REST_KEY/i);
  });
});
