/**
 * Cloudflare R2 object storage — SERVER-ONLY (see ./config.ts for the
 * boundary). R2's access keys sign requests the same way S3's do, via
 * `aws4fetch`; no object is ever made public and no credential reaches a
 * client. The caller gets a short-lived signed URL back, never the keys.
 *
 * Matches the private-storage model the product needs for POD photos, driver
 * documents and other verification evidence: the bucket itself stays
 * private, and a signed GET works for `expiresInSeconds` only. Nothing in
 * this repo calls it yet — there is no upload flow wired to it, Supabase
 * Storage is not in use today, and this is additive new capability, not a
 * replacement of anything running (docs/PHASE1_TASKS.md 2026-10-04).
 */
import { AwsV4Signer } from "aws4fetch";

import { getR2Config, type ServerEnv } from "./config";

export type SignedUrlOptions = {
  expiresInSeconds?: number;
};

const DEFAULT_EXPIRY_SECONDS = 300; // 5 minutes: short-lived by default.
const MAX_EXPIRY_SECONDS = 3600; // R2/S3 presigned URLs are capped at 7 days; this repo caps tighter.

/** Rejects a key that would escape the bucket path (`../`) or target a folder. */
function assertSafeObjectKey(objectKey: string): void {
  if (
    objectKey === "" ||
    objectKey.startsWith("/") ||
    objectKey.endsWith("/") ||
    objectKey.split("/").includes("..")
  ) {
    throw new Error(`Unsafe R2 object key: ${objectKey}`);
  }
}

function clampExpiry(expiresInSeconds: number | undefined): number {
  const requested = expiresInSeconds ?? DEFAULT_EXPIRY_SECONDS;
  return Math.min(Math.max(1, requested), MAX_EXPIRY_SECONDS);
}

export type ObjectStorage = {
  /** A short-lived URL to read a private object directly from R2. */
  getDownloadUrl(objectKey: string, options?: SignedUrlOptions): Promise<string>;
  /** A short-lived URL the client can PUT the object body to directly. */
  getUploadUrl(objectKey: string, options?: SignedUrlOptions): Promise<string>;
};

export function createObjectStorage(env: ServerEnv): ObjectStorage {
  const { accountId, accessKeyId, secretAccessKey, bucketName, endpoint } = getR2Config(env);
  // async: a bad object key must reject the returned promise, not throw
  // synchronously, since every caller treats this as Promise<string>.
  const signer = async (method: "GET" | "PUT", objectKey: string, expiresInSeconds: number) => {
    assertSafeObjectKey(objectKey);
    const url = new URL(`${endpoint}/${bucketName}/${objectKey}`);
    url.searchParams.set("X-Amz-Expires", String(clampExpiry(expiresInSeconds)));
    const signed = await new AwsV4Signer({
      method,
      url: url.toString(),
      accessKeyId,
      secretAccessKey,
      service: "s3",
      region: "auto",
      signQuery: true,
    }).sign();
    return signed.url.toString();
  };
  void accountId; // kept on the config type for callers that need it; unused in the signer itself.

  return {
    getDownloadUrl: (objectKey, options) =>
      signer("GET", objectKey, clampExpiry(options?.expiresInSeconds)),
    getUploadUrl: (objectKey, options) =>
      signer("PUT", objectKey, clampExpiry(options?.expiresInSeconds)),
  };
}
