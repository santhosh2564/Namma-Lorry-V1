/**
 * Root config gate (validation M2). A staging or production build with a
 * missing or invalid env renders the blocking Misconfigured screen from the
 * root layout, before the auth bootstrap and before any route, so no screen
 * can reach Supabase. It reports once to Sentry, by key name only.
 *
 * babel-preset-expo inlines EXPO_PUBLIC_* at transform time, so the env cannot
 * change per test; the config module is mocked with `resolveConfig`'s output
 * shape instead (the resolver itself is covered in src/lib/config.test.ts).
 * Lives outside `app/` because Expo Router turns every file there into a route.
 */
import { render } from "@testing-library/react-native";
import type { ComponentType } from "react";

import en from "@/i18n/en.json";
import type { ConfigProblem } from "@/lib/config";

const mockBootstrap = jest.fn();
const mockReportMisconfigured = jest.fn();
let mockProblems: ConfigProblem[] = [];

jest.mock("@/lib/config", () => ({
  config: {
    appEnv: "production",
    supabaseUrl: "",
    supabaseAnonKey: "",
    mapplsMapSdkKey: "",
    androidStoreUrl: "",
    iosStoreUrl: "",
    sentryDsn: "",
  },
  get configProblems() {
    return mockProblems;
  },
  isDev: false,
  isProd: true,
}));
jest.mock("@/lib/sentry", () => ({
  initSentry: jest.fn(),
  reportMisconfigured: (...args: unknown[]) => mockReportMisconfigured(...args),
  setSentryUser: jest.fn(),
  wrapWithSentry: <T,>(component: T) => component,
}));
jest.mock("@/tracking/task", () => ({}));
jest.mock("@/features/auth/useAuthBootstrap", () => ({
  useAuthBootstrap: () => mockBootstrap(),
}));
jest.mock("@/theme/fonts", () => ({ useAppFonts: () => [true, null] }));
jest.mock(
  "react-native-safe-area-context",
  () => jest.requireActual("react-native-safe-area-context/jest/mock").default,
);
jest.mock("react-native-gesture-handler", () => ({
  GestureHandlerRootView: jest.requireActual("react-native").View,
}));
jest.mock("expo-router", () => {
  const { Text } = jest.requireActual("react-native");
  const Stack = () => <Text testID="app-stack">app</Text>;
  Stack.Screen = function Screen() {
    return null;
  };
  return { Stack };
});

/**
 * Loaded once, on first use, after the first test has set its problems: the
 * module-scope startup report runs then. (`jest.isolateModules` would load a
 * second React and break the hooks.) The gate itself reads `configProblems`
 * at render time through the getter above.
 */
let cachedLayout: ComponentType | undefined;
function loadLayout(): ComponentType {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- deferred on purpose, see above
  cachedLayout ??= require("../../app/_layout").default as ComponentType;
  return cachedLayout;
}

beforeEach(() => {
  mockBootstrap.mockClear();
});

describe("root layout config gate", () => {
  it("misconfigured → blocking screen with key names, no bootstrap, no routes", async () => {
    mockProblems = [
      { key: "EXPO_PUBLIC_SUPABASE_URL", reason: "insecure" },
      { key: "EXPO_PUBLIC_SUPABASE_ANON_KEY", reason: "missing" },
    ];
    const Layout = loadLayout();
    const screen = await render(<Layout />);

    expect(screen.getByText(en.common.misconfigured.title)).toBeTruthy();
    expect(screen.getByText(/EXPO_PUBLIC_SUPABASE_URL/)).toBeTruthy();
    expect(screen.getByText(/EXPO_PUBLIC_SUPABASE_ANON_KEY/)).toBeTruthy();
    expect(screen.queryByTestId("app-stack")).toBeNull();
    expect(mockBootstrap).not.toHaveBeenCalled();

    // Reported once at startup, not per render.
    await screen.rerender(<Layout />);
    expect(mockReportMisconfigured).toHaveBeenCalledTimes(1);
    expect(mockReportMisconfigured).toHaveBeenCalledWith(mockProblems);
  });

  it("valid config → the navigator renders and nothing more is reported", async () => {
    mockProblems = [];
    mockReportMisconfigured.mockClear();
    const Layout = loadLayout();
    const screen = await render(<Layout />);

    expect(screen.getByTestId("app-stack")).toBeTruthy();
    expect(screen.queryByText(en.common.misconfigured.title)).toBeNull();
    expect(mockBootstrap).toHaveBeenCalled();
    expect(mockReportMisconfigured).not.toHaveBeenCalled();
  });
});
