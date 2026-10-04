/**
 * Clerk session verification — SERVER-ONLY (see ./config.ts for the boundary
 * this sits behind).
 *
 * This repo does not yet sign drivers in with Clerk — see docs/PHASE1_TASKS.md
 * 2026-10-04: driver phone OTP stays on Supabase Auth until Clerk's SMS
 * coverage for Indian numbers is confirmed. What this module gives the rest
 * of the server side is a way to check an already-issued Clerk session (for
 * example on a console/admin route that does move to Clerk first), without
 * each Pages Function re-implementing JWT verification.
 */
import { createClerkClient } from "@clerk/backend";

import { getClerkServerConfig, type ServerEnv } from "./config";

export type AuthResult = { signedIn: true; userId: string } | { signedIn: false; reason: string };

export type RequestAuthenticator = {
  authenticate(request: Request): Promise<AuthResult>;
};

export function createRequestAuthenticator(env: ServerEnv): RequestAuthenticator {
  const { secretKey, publishableKey } = getClerkServerConfig(env);
  const clerkClient = createClerkClient({ secretKey, publishableKey });

  return {
    async authenticate(request: Request): Promise<AuthResult> {
      const state = await clerkClient.authenticateRequest(request);
      if (!state.isSignedIn) {
        // `.message` on a Clerk auth-state reason is diagnostic text, not a
        // secret, but it can repeat request headers, so it is not logged here.
        return { signedIn: false, reason: state.status };
      }
      const auth = state.toAuth();
      return { signedIn: true, userId: auth.userId };
    },
  };
}
