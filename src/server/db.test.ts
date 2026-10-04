import { neon } from "@neondatabase/serverless";

import { ServerConfigError } from "./config";
import { createDatabaseClient } from "./db";

jest.mock("@neondatabase/serverless", () => ({ neon: jest.fn() }));

const mockNeon = neon as jest.Mock;

describe("createDatabaseClient", () => {
  afterEach(() => jest.clearAllMocks());

  it("requires DATABASE_URL", () => {
    expect(() => createDatabaseClient({})).toThrow(ServerConfigError);
    expect(mockNeon).not.toHaveBeenCalled();
  });

  it("passes the connection string to neon() and returns its query function", () => {
    const fakeSql = jest.fn();
    mockNeon.mockReturnValue(fakeSql);
    const sql = createDatabaseClient({ DATABASE_URL: "postgres://u:p@host/db" });
    expect(mockNeon).toHaveBeenCalledWith("postgres://u:p@host/db");
    expect(sql).toBe(fakeSql);
  });
});
