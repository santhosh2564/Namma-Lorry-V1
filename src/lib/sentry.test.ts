const mockInit = jest.fn();
const mockCapture = jest.fn();
const mockSetUser = jest.fn();
jest.mock('@sentry/react-native', () => ({
  init: (o: unknown) => mockInit(o),
  captureException: (...a: unknown[]) => mockCapture(...a),
  setUser: (u: unknown) => mockSetUser(u),
  setTag: jest.fn(),
  wrap: (c: unknown) => c,
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.0', nativeBuildVersion: '12' }));
const mockConfig: Record<string, string | undefined> = { EXPO_PUBLIC_APP_ENV: 'staging' };
jest.mock('./config', () => ({ config: mockConfig }));

function load() {
  let mod!: typeof import('./sentry');
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('./sentry');
  });
  return mod;
}

beforeEach(() => {
  mockInit.mockReset();
  mockCapture.mockReset();
  mockSetUser.mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

it('stays off without a DSN: nothing is initialised or sent', () => {
  mockConfig.EXPO_PUBLIC_SENTRY_DSN = undefined;
  const s = load();
  s.initSentry();
  s.reportError(new Error('x'));
  s.setSentryUser('u-1');
  expect(mockInit).not.toHaveBeenCalled();
  expect(mockCapture).not.toHaveBeenCalled();
  expect(mockSetUser).not.toHaveBeenCalled();
});

it('initialises with release tagging, no default PII and the scrubbers', () => {
  mockConfig.EXPO_PUBLIC_SENTRY_DSN = 'https://key@o1.ingest.sentry.io/1';
  const s = load();
  s.initSentry();
  s.initSentry(); // once only
  expect(mockInit).toHaveBeenCalledTimes(1);
  const o = mockInit.mock.calls[0][0];
  expect(o).toMatchObject({
    environment: 'staging',
    release: 'namma-lorry@1.0.0+12',
    dist: '12',
    sendDefaultPii: false,
    attachViewHierarchy: false,
    attachScreenshot: false,
  });
  const scrubbed = o.beforeSend({
    message: 'failed for +91 98402 34521 at 12.95630, 79.94220',
    user: { id: 'u-1', phone: '919840234521' },
  });
  expect(scrubbed.user).toEqual({ id: 'u-1' });
  expect(scrubbed.message).not.toMatch(/9840234521|12\.9563/);
  expect(o.beforeBreadcrumb({ message: 'lat=12.9563' }).message).toBe('lat=[redacted]');

  s.setSentryUser('u-1');
  expect(mockSetUser).toHaveBeenCalledWith({ id: 'u-1' });
  s.reportError(new Error('boom'), { source: 'query' });
  expect(mockCapture).toHaveBeenCalledWith(expect.any(Error), { extra: { source: 'query' } });
});
