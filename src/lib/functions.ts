import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from './supabase';

/** Error from an Edge Function, carrying its stable `{ error: CODE }` code. */
export class FunctionError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'FunctionError';
  }
}

/** Calls an Edge Function with the user's session and maps failures to FunctionError. */
export async function invokeFunction<T>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body: body as Record<string, unknown> });
  if (!error) return data as T;
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    let payload: { error?: string; message?: string } = {};
    try {
      payload = await res.json();
    } catch {
      // non-JSON error body (gateway)
    }
    throw new FunctionError(payload.error ?? 'UNKNOWN', res.status, payload.message);
  }
  throw new FunctionError('NETWORK', 0, error.message);
}
