/**
 * Crash reporting (validation report B4, PRD §7 crash-free ≥ 99 %, docs/09 §1
 * breach readiness). Sentry stays off without a DSN, never sends default PII,
 * tags every event with release / dist / environment, and scrubs every event
 * and breadcrumb before it leaves the phone.
 */
import type { AppConfig } from "@/lib/config";

const mockInit = jest.fn();
const mockCaptureException = jest.fn();
const mockSetUser = jest.fn();

jest.mock("@sentry/react-native", () => ({
  init: (...args: unknown[]) => mockInit(...args),
  captureException: (...args: unknown[]) => mockCaptureException(...args),
  setUser: (...args: unknown[]) => mockSetUser(...args),
  wrap: <T>(component: T) => component,
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { version: "1.2.3" } },
}));

jest.mock("expo-application", () => ({ nativeBuildVersion: "42" }));

type SentryModule = typeof import("@/lib/sentry");

/** Load `@/lib/sentry` fresh against a config with the given overrides. */
function loadSentry(overrides: Partial<AppConfig>): SentryModule {
  let loaded: SentryModule | undefined;
  jest.isolateModules(() => {
    jest.doMock("@/lib/config", () => {
      const config = { ...jest.requireActual("@/lib/config").config, ...overrides };
      return { config, isProd: config.appEnv === "production", isDev: false };
    });
    loaded = jest.requireActual<SentryModule>("@/lib/sentry");
  });
  return loaded!;
}

type InitOptions = {
  dsn: string;
  environment: string;
  release: string;
  dist: string;
  sendDefaultPii: boolean;
  beforeSend: (event: Record<string, unknown>) => Record<string, unknown>;
  beforeBreadcrumb: (breadcrumb: Record<string, unknown>) => Record<string, unknown>;
};

function initOptions(): InitOptions {
  return mockInit.mock.calls[0][0] as InitOptions;
}

beforeEach(() => {
  mockInit.mockClear();
  mockCaptureException.mockClear();
  mockSetUser.mockClear();
});

describe("initSentry", () => {
  it("does nothing without a DSN, and reporting stays a safe no-op", () => {
    const sentry = loadSentry({ sentryDsn: "" });
    sentry.initSentry();
    sentry.reportError(new Error("boom"));
    sentry.setSentryUser("u1");

    expect(mockInit).not.toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockSetUser).not.toHaveBeenCalled();
  });

  it("initialises once with release, dist, environment and no default PII", () => {
    const sentry = loadSentry({
      sentryDsn: "https://key@o1.ingest.sentry.io/1",
      appEnv: "staging",
    });
    sentry.initSentry();
    sentry.initSentry();

    expect(mockInit).toHaveBeenCalledTimes(1);
    expect(initOptions()).toMatchObject({
      dsn: "https://key@o1.ingest.sentry.io/1",
      environment: "staging",
      release: "namma-lorry@1.2.3",
      dist: "42",
      sendDefaultPii: false,
    });
  });

  it("scrubs phone numbers and coordinates from every event and breadcrumb", () => {
    const sentry = loadSentry({ sentryDsn: "https://key@o1.ingest.sentry.io/1" });
    sentry.initSentry();
    const { beforeSend, beforeBreadcrumb } = initOptions();

    const event = beforeSend({
      message: "start failed for 9876543210 at 12.95631, 79.94221",
      user: { id: "u1", phone: "+919876543210" },
    });
    const crumb = beforeBreadcrumb({ category: "fetch", data: { p_lat: 12.9, p_lng: 79.9 } });

    expect(JSON.stringify(event)).not.toMatch(/9876543210|12\.95631|79\.94221/);
    expect(event.user).toEqual({ id: "u1" });
    expect(JSON.stringify(crumb)).not.toMatch(/12\.9|79\.9/);
  });

  it("reports handled errors and identifies the user by opaque id only", () => {
    const sentry = loadSentry({ sentryDsn: "https://key@o1.ingest.sentry.io/1" });
    sentry.initSentry();
    const error = new Error("boom");
    sentry.reportError(error, { where: "uploader" });
    sentry.setSentryUser("u1");
    sentry.setSentryUser(null);

    expect(mockCaptureException).toHaveBeenCalledWith(error, { extra: { where: "uploader" } });
    expect(mockSetUser).toHaveBeenNthCalledWith(1, { id: "u1" });
    expect(mockSetUser).toHaveBeenNthCalledWith(2, null);
  });
});
