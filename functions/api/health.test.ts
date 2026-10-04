import { buildHealthResponse, onRequestGet } from "./health";

const FULL_ENV = {
  DATABASE_URL: "postgres://u:p@host/db",
  CLERK_SECRET_KEY: "sk_test_x",
  CLERK_PUBLISHABLE_KEY: "pk_test_x",
  RESEND_API_KEY: "re_x",
  EMAIL_FROM: "Namma Lorry <a@b.com>",
  R2_ACCOUNT_ID: "acct",
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET_NAME: "bucket",
};

describe("buildHealthResponse", () => {
  it("reports every service configured when all variables are present", () => {
    expect(buildHealthResponse(FULL_ENV)).toEqual({
      status: "ok",
      services: { database: true, clerk: true, email: true, storage: true },
    });
  });

  it("reports false per service, independently, when env is empty", () => {
    expect(buildHealthResponse({})).toEqual({
      status: "ok",
      services: { database: false, clerk: false, email: false, storage: false },
    });
  });

  it("never includes a value from the environment in its output", () => {
    const body = JSON.stringify(buildHealthResponse(FULL_ENV));
    for (const value of Object.values(FULL_ENV)) {
      expect(body).not.toContain(value);
    }
  });
});

describe("onRequestGet", () => {
  it("returns the health body as a JSON Response", async () => {
    const response = await onRequestGet({ env: FULL_ENV });
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual(buildHealthResponse(FULL_ENV));
  });
});
