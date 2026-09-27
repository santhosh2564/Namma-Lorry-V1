/**
 * S1 Splash gate test (M5, moved out of `app/` in M6).
 *
 * `routing.test.ts` proves the decision; this proves the screen actually
 * navigates on it, so a broken store subscription or a lost navigation cannot
 * ship as a blank splash.
 *
 * This test deliberately lives outside `app/`. Expo Router turns *every*
 * `.tsx` file in `app/` into a route — it does not skip `*.test.tsx` — so a
 * colocated test file is bundled into the app, evaluated at start-up and throws
 * `expect is not defined` inside the router itself.
 */
import { render } from "@testing-library/react-native";

// The root layout does this before anything renders; resources are bundled, so
// `init` is synchronous and the copy is there on the first paint.
import "@/i18n";

import SplashScreen from "../../../app/index";
import { useAuthStore } from "@/features/auth/store";

// `jest.mock` factories are hoisted, so every out-of-scope name they touch has
// to be prefixed with `mock` (Jest's own rule).
const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
}));

jest.mock("@/features/auth/platform", () => ({ currentPlatform: () => "android" }));

const mockProfileQuery = {
  data: null as unknown,
  isFetched: true,
  isError: false,
  refetch: jest.fn(),
};

jest.mock("@/features/auth/useProfile", () => ({
  useProfile: () => mockProfileQuery,
}));

function setState(state: Partial<ReturnType<typeof useAuthStore.getState>>): void {
  useAuthStore.setState({
    status: "signed_in",
    userId: "11111111-1111-1111-1111-111111111111",
    pendingPhone: null,
    resendAvailableAt: null,
    attemptsLeft: 3,
    activeTripId: null,
    trackingChecked: true,
    ...state,
  });
}

const driver = {
  id: "11111111-1111-1111-1111-111111111111",
  role: "driver" as const,
  isActive: true,
  fullName: "Murugan S",
  permissionsGranted: true,
};

describe("S1 Splash", () => {
  beforeEach(() => {
    mockReplace.mockClear();
  });

  it("sends a signed-out user to sign in", async () => {
    setState({ status: "signed_out", userId: null });
    await render(<SplashScreen />);

    expect(mockReplace).toHaveBeenCalledWith("/(auth)/sign-in");
  });

  it("sends a native driver to My Trips", async () => {
    setState({});
    mockProfileQuery.data = driver;
    await render(<SplashScreen />);

    expect(mockReplace).toHaveBeenCalledWith("/(driver)");
  });

  it("sends a driver without permissions into onboarding", async () => {
    setState({});
    mockProfileQuery.data = { ...driver, permissionsGranted: false };
    await render(<SplashScreen />);

    expect(mockReplace).toHaveBeenCalledWith("/(onboarding)/permissions");
  });

  it("sends an admin to the console", async () => {
    setState({});
    mockProfileQuery.data = { ...driver, role: "admin" };
    await render(<SplashScreen />);

    expect(mockReplace).toHaveBeenCalledWith("/(console)");
  });

  it("shows the access notice for a deactivated account", async () => {
    setState({});
    mockProfileQuery.data = { ...driver, isActive: false };
    await render(<SplashScreen />);

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: "/access-notice",
      params: { variant: "deactivated" },
    });
  });

  it("resumes an unfinished trip before anything else", async () => {
    setState({ activeTripId: "trip-1" });
    mockProfileQuery.data = driver;
    const { getByText } = await render(<SplashScreen />);

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: "/(driver)/trips/[id]/live",
      params: { id: "trip-1" },
    });
    expect(getByText("Restoring your trip…")).toBeTruthy();
  });

  it("stays on the splash while the session is still resolving", async () => {
    setState({ status: "initialising", userId: null });
    mockProfileQuery.data = null;
    await render(<SplashScreen />);

    expect(mockReplace).not.toHaveBeenCalled();
  });
});
