/**
 * Cloudflare Pages Function: GET /api/health
 *
 * Proves the server/client boundary end to end — this file runs on
 * Cloudflare's edge, not in the Expo bundle, and is the first real caller of
 * `src/server/config.ts`. It reports which server services are *configured*
 * as booleans only; it never returns a key, URL or connection string.
 *
 * Pages auto-discovers `functions/` and bundles each route separately from
 * the Expo web export in `dist/` — this file is never reachable from
 * `expo-router/entry`, so Metro cannot pull it (or its secrets) into the app
 * bundle. CI checks the exported `dist/` for leakage anyway (ci.yml).
 */
import {
  getClerkServerConfig,
  getDatabaseConfig,
  getEmailServerConfig,
  getR2Config,
  ServerConfigError,
} from "@/server/config";

/** The subset of Cloudflare's Pages Function context this route needs. */
export type PagesContext = { env: Record<string, string | undefined> };

function isConfigured(check: () => unknown): boolean {
  try {
    check();
    return true;
  } catch (error) {
    if (error instanceof ServerConfigError) {
      return false;
    }
    throw error;
  }
}

export function buildHealthResponse(env: Record<string, string | undefined>): object {
  return {
    status: "ok",
    services: {
      database: isConfigured(() => getDatabaseConfig(env)),
      clerk: isConfigured(() => getClerkServerConfig(env)),
      email: isConfigured(() => getEmailServerConfig(env)),
      storage: isConfigured(() => getR2Config(env)),
    },
  };
}

export async function onRequestGet({ env }: PagesContext): Promise<Response> {
  return Response.json(buildHealthResponse(env));
}
