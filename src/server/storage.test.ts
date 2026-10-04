import { AwsV4Signer } from "aws4fetch";

import { ServerConfigError } from "./config";
import { createObjectStorage } from "./storage";

jest.mock("aws4fetch", () => ({ AwsV4Signer: jest.fn() }));

const mockSigner = AwsV4Signer as unknown as jest.Mock;

const ENV = {
  R2_ACCOUNT_ID: "acct123",
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET_NAME: "pod-evidence",
};

function mockSignTo(url: string) {
  mockSigner.mockImplementation(() => ({ sign: () => Promise.resolve({ url: new URL(url) }) }));
}

describe("createObjectStorage", () => {
  afterEach(() => jest.clearAllMocks());

  it("requires the full R2 config", () => {
    expect(() => createObjectStorage({})).toThrow(ServerConfigError);
  });

  it("signs a GET for getDownloadUrl and a PUT for getUploadUrl", async () => {
    mockSignTo(
      "https://acct123.r2.cloudflarestorage.com/pod-evidence/trips/1/pod.jpg?X-Amz-Signature=abc",
    );
    const storage = createObjectStorage(ENV);

    await storage.getDownloadUrl("trips/1/pod.jpg");
    expect(mockSigner.mock.calls[0][0]).toMatchObject({
      method: "GET",
      service: "s3",
      signQuery: true,
    });

    await storage.getUploadUrl("trips/1/pod.jpg");
    expect(mockSigner.mock.calls[1][0]).toMatchObject({ method: "PUT" });
  });

  it("never passes the secret access key into the resulting URL object", async () => {
    mockSignTo("https://acct123.r2.cloudflarestorage.com/pod-evidence/x?X-Amz-Signature=abc");
    const url = await createObjectStorage(ENV).getDownloadUrl("x");
    expect(url).not.toContain("secret");
  });

  it("defaults to a 5 minute expiry and clamps a longer request to 1 hour", async () => {
    mockSignTo("https://example.com/b/x");
    const storage = createObjectStorage(ENV);

    await storage.getDownloadUrl("x");
    expect(mockSigner.mock.calls[0][0].url).toContain("X-Amz-Expires=300");

    await storage.getDownloadUrl("x", { expiresInSeconds: 999_999 });
    expect(mockSigner.mock.calls[1][0].url).toContain("X-Amz-Expires=3600");
  });

  it("rejects an object key that escapes the bucket path", async () => {
    mockSignTo("https://example.com/b/x");
    const storage = createObjectStorage(ENV);
    await expect(storage.getDownloadUrl("../secrets.json")).rejects.toThrow(/Unsafe/);
    await expect(storage.getDownloadUrl("/abs/path")).rejects.toThrow(/Unsafe/);
    await expect(storage.getDownloadUrl("a/folder/")).rejects.toThrow(/Unsafe/);
    await expect(storage.getDownloadUrl("")).rejects.toThrow(/Unsafe/);
  });
});
