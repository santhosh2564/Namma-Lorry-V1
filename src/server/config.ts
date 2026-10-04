/**
 * Server-only configuration — SERVER-ONLY (see src/server/email/resend.ts for
 * the same boundary on the email service; this is the general-purpose
 * version for Neon, Clerk and R2).
 *
 * Every function here reads from an explicit env map the caller passes in —
 * never from `process.env` at module load — because these run in a Cloudflare
 * Pages Function, where secrets arrive as the per-request `env` binding, not
 * as process environment variables. `src/lib/config.ts` is the client-safe
 * counterpart: nothing in this file may be imported from `app/` or the rest
 * of `src/` (enforced by the `no-restricted-imports` rule in eslint.config.mjs).
 *
 * A missing variable fails with the variable's NAME only, never a value —
 * required by the production environment prompt (§13) and by CLAUDE.md hard
 * rule 6.
 */
export class ServerConfigError extends Error {
  override name = "ServerConfigError";
}

export type ServerEnv = Record<string, string | undefined>;

function requireEnv(env: ServerEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new ServerConfigError(`Missing required server environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(env: ServerEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

export type DatabaseConfig = { databaseUrl: string };

/** Neon's connection string. Never logged, never sent to the client. */
export function getDatabaseConfig(env: ServerEnv): DatabaseConfig {
  return { databaseUrl: requireEnv(env, "DATABASE_URL") };
}

export type ClerkServerConfig = { secretKey: string; publishableKey: string };

/**
 * `publishableKey` is required server-side too: `@clerk/backend`'s session
 * verification needs it alongside the secret key. It is not a secret — the
 * client reads its own copy from `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
 * (src/lib/config.ts) — but the two must agree, so both are read here from
 * the server env rather than trusting a value the client sent.
 */
export function getClerkServerConfig(env: ServerEnv): ClerkServerConfig {
  return {
    secretKey: requireEnv(env, "CLERK_SECRET_KEY"),
    publishableKey: requireEnv(env, "CLERK_PUBLISHABLE_KEY"),
  };
}

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  /** S3-compatible endpoint; derived from accountId when not set explicitly. */
  endpoint: string;
};

export function getR2Config(env: ServerEnv): R2Config {
  const accountId = requireEnv(env, "R2_ACCOUNT_ID");
  return {
    accountId,
    accessKeyId: requireEnv(env, "R2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv(env, "R2_SECRET_ACCESS_KEY"),
    bucketName: requireEnv(env, "R2_BUCKET_NAME"),
    endpoint: optionalEnv(env, "R2_ENDPOINT") ?? `https://${accountId}.r2.cloudflarestorage.com`,
  };
}

export type EmailServerConfig = { apiKey: string; from: string };

export function getEmailServerConfig(env: ServerEnv): EmailServerConfig {
  return { apiKey: requireEnv(env, "RESEND_API_KEY"), from: requireEnv(env, "EMAIL_FROM") };
}
