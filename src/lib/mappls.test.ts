import { FunctionsHttpError } from '@supabase/supabase-js';

import { FunctionError } from './functions';
import { mappls } from './mappls';
import { supabase } from './supabase';

jest.mock('./supabase', () => ({ supabase: { functions: { invoke: jest.fn() } } }));
const invoke = supabase.functions.invoke as jest.Mock;

beforeEach(() => invoke.mockReset());

describe('mappls client', () => {
  it('sends the docs/06 request shapes to mappls-proxy', async () => {
    invoke.mockResolvedValue({ data: [], error: null });
    await mappls.autosuggest('  sipcot  ', { lat: 12.9, lng: 79.9 });
    await mappls.geocode('Peenya');
    await mappls.reverse({ lat: 1, lng: 2 });
    await mappls.distance({ lat: 1, lng: 2 }, { lat: 3, lng: 4 });
    expect(invoke.mock.calls.map((c) => [c[0], c[1].body])).toEqual([
      ['mappls-proxy', { action: 'autosuggest', query: 'sipcot', lat: 12.9, lng: 79.9 }],
      ['mappls-proxy', { action: 'geocode', address: 'Peenya' }],
      ['mappls-proxy', { action: 'reverse', lat: 1, lng: 2 }],
      ['mappls-proxy', { action: 'distance', from: { lat: 1, lng: 2 }, to: { lat: 3, lng: 4 } }],
    ]);
  });

  it('trims autosuggest queries to the 45-char Mappls limit', async () => {
    invoke.mockResolvedValue({ data: [], error: null });
    await mappls.autosuggest('x'.repeat(60));
    expect(invoke.mock.calls[0][1].body.query).toHaveLength(45);
  });

  it('returns typed data', async () => {
    invoke.mockResolvedValue({ data: { distanceM: 511872, durationS: 34813 }, error: null });
    await expect(mappls.distance({ lat: 1, lng: 2 }, { lat: 3, lng: 4 })).resolves.toEqual({
      distanceM: 511872,
      durationS: 34813,
    });
  });

  it('maps HTTP errors to FunctionError with the proxy code', async () => {
    const res = new Response(JSON.stringify({ error: 'RATE_LIMITED' }), { status: 429 });
    invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(res) });
    await expect(mappls.reverse({ lat: 1, lng: 2 })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
    });
  });

  it('maps network errors to NETWORK', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('Failed to send a request') });
    const err = await mappls.reverse({ lat: 1, lng: 2 }).catch((e) => e);
    expect(err).toBeInstanceOf(FunctionError);
    expect(err.code).toBe('NETWORK');
  });
});
