import en from '@/i18n/en.json';

import { classifyError, errorMessage, NotConfiguredError, RPC_ERROR_CODES } from '../errors';

const rpcError = (message: string, code = 'P0001') => ({
  message,
  code,
  details: null,
  hint: null,
});

describe('classifyError', () => {
  it.each(RPC_ERROR_CODES.filter((code) => code !== 'OUTSIDE_PICKUP'))(
    'maps %s to its own message',
    (code) => {
      const result = classifyError(rpcError(code));
      expect(result).toMatchObject({ kind: 'rpc', code, key: `rpc.${code}` });
      expect(errorMessage(rpcError(code))).toBe(en.rpc[code]);
    },
  );

  it('parses OUTSIDE_PICKUP:<metres> into metres and a km message', () => {
    const result = classifyError(rpcError('OUTSIDE_PICKUP:3120'));
    expect(result).toMatchObject({ code: 'OUTSIDE_PICKUP', metres: 3120, params: { km: '3.1' } });
    expect(errorMessage(rpcError('OUTSIDE_PICKUP:3120'))).toBe(
      'You are 3.1 km from the pickup. Go to the pickup location to start.',
    );
  });

  it('has an en.json message for every RPC code', () => {
    for (const code of RPC_ERROR_CODES) expect(en.rpc[code]).toBeTruthy();
  });

  it.each(['TypeError: Failed to fetch', 'Network request failed', 'fetch failed'])(
    'treats "%s" as network',
    (message) => {
      expect(classifyError(new Error(message)).kind).toBe('network');
    },
  );

  it('maps RLS / privilege errors to forbidden without leaking server text', () => {
    const error = rpcError('new row violates row-level security policy for table "trips"', '42501');
    expect(classifyError(error).kind).toBe('forbidden');
    expect(errorMessage(error)).not.toContain('row-level');
  });

  it('maps expired JWTs to a session message', () => {
    expect(classifyError(rpcError('JWT expired', 'PGRST303')).kind).toBe('session');
  });

  it('handles missing configuration and unknown errors', () => {
    expect(classifyError(new NotConfiguredError()).kind).toBe('notConfigured');
    expect(classifyError(undefined).key).toBe('errors.generic');
    expect(errorMessage(new Error('duplicate key value violates unique constraint'))).toBe(
      en.errors.generic,
    );
  });
});
