// Shared HTTP helpers for Edge Functions. Every response is JSON; errors are
// `{ error: CODE, message? }` so the app can switch on a stable code.

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extra },
  });
}

export function error(status: number, code: string, message?: string, extra: Record<string, string> = {}) {
  return json(message ? { error: code, message } : { error: code }, status, extra);
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

/** Runs a handler with CORS preflight, method check, and HttpError → JSON mapping. */
export async function handle(req: Request, fn: () => Promise<Response>): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return error(405, 'METHOD_NOT_ALLOWED');
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HttpError) return error(e.status, e.code, e.message === e.code ? undefined : e.message);
    console.error(e);
    return error(500, 'INTERNAL');
  }
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, 'INVALID_JSON');
  }
}
