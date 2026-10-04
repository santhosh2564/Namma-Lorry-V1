import { createClerkClient } from "@clerk/backend";

import { createRequestAuthenticator } from "./clerk";
import { ServerConfigError } from "./config";

jest.mock("@clerk/backend", () => ({ createClerkClient: jest.fn() }));

const mockCreateClerkClient = createClerkClient as jest.Mock;

describe("createRequestAuthenticator", () => {
  afterEach(() => jest.clearAllMocks());

  it("requires CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY", () => {
    expect(() => createRequestAuthenticator({})).toThrow(ServerConfigError);
    expect(mockCreateClerkClient).not.toHaveBeenCalled();
  });

  it("constructs the Clerk client with the server keys", () => {
    mockCreateClerkClient.mockReturnValue({ authenticateRequest: jest.fn() });
    createRequestAuthenticator({
      CLERK_SECRET_KEY: "sk_test_x",
      CLERK_PUBLISHABLE_KEY: "pk_test_x",
    });
    expect(mockCreateClerkClient).toHaveBeenCalledWith({
      secretKey: "sk_test_x",
      publishableKey: "pk_test_x",
    });
  });

  it("returns signedIn:true with the Clerk user id for a valid session", async () => {
    mockCreateClerkClient.mockReturnValue({
      authenticateRequest: jest.fn().mockResolvedValue({
        isSignedIn: true,
        toAuth: () => ({ userId: "user_123" }),
      }),
    });
    const authenticator = createRequestAuthenticator({
      CLERK_SECRET_KEY: "sk_test_x",
      CLERK_PUBLISHABLE_KEY: "pk_test_x",
    });
    await expect(authenticator.authenticate(new Request("https://example.com"))).resolves.toEqual({
      signedIn: true,
      userId: "user_123",
    });
  });

  it("returns signedIn:false with a status, not a thrown error, for no session", async () => {
    mockCreateClerkClient.mockReturnValue({
      authenticateRequest: jest.fn().mockResolvedValue({ isSignedIn: false, status: "signed-out" }),
    });
    const authenticator = createRequestAuthenticator({
      CLERK_SECRET_KEY: "sk_test_x",
      CLERK_PUBLISHABLE_KEY: "pk_test_x",
    });
    await expect(authenticator.authenticate(new Request("https://example.com"))).resolves.toEqual({
      signedIn: false,
      reason: "signed-out",
    });
  });
});
