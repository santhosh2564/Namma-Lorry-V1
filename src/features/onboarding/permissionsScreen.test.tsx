/**
 * D1 Continue must not pass a failed consent write (validation report B3c).
 *
 * `recordConsent()` reports failure by *returning* `{ ok: false }`, not by
 * throwing, so a screen that only catches exceptions lets a driver whose
 * consent was never stored walk on into tracking (docs/09 §1).
 *
 * Lives outside `app/` for the reason given in `src/features/auth/splash.test.tsx`.
 */
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import "@/i18n";

import PermissionsScreen from "../../../app/(onboarding)/permissions";
import { recordConsent } from "@/features/onboarding/consent";

const mockReplace = jest.fn();
const mockInvalidateQueries = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  Stack: { Screen: () => null },
}));

// The profile query key lives in its own module so this screen (and its test)
// do not pull in the Supabase client.
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

jest.mock("expo-linking", () => ({ openSettings: jest.fn() }));

jest.mock("@/features/onboarding/consent", () => ({ recordConsent: jest.fn() }));

jest.mock("@/features/onboarding/permissions", () => ({
  ...jest.requireActual("@/features/onboarding/permissions"),
  readPermissionSnapshot: jest.fn(async () => ({
    foreground: "granted",
    background: "granted",
    notifications: "granted",
  })),
}));

const mockRecordConsent = recordConsent as jest.MockedFunction<typeof recordConsent>;

async function renderWithGrants(): Promise<void> {
  await render(<PermissionsScreen />);
  // The first permission read resolves after mount.
  await act(async () => {});
}

beforeEach(() => {
  mockReplace.mockClear();
  mockInvalidateQueries.mockClear();
  mockRecordConsent.mockReset();
});

describe("D1 Continue", () => {
  it("blocks the flow and shows the error when the consent write fails", async () => {
    mockRecordConsent.mockResolvedValue({ ok: false, kind: "network", message: "Failed to fetch" });
    await renderWithGrants();

    await fireEvent.press(screen.getByTestId("onboarding-continue"));

    expect(mockRecordConsent).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByTestId("onboarding-consent-error")).toBeTruthy();
  });

  it("moves on to the battery step once the consent is stored", async () => {
    mockRecordConsent.mockResolvedValue({ ok: true });
    await renderWithGrants();

    await fireEvent.press(screen.getByTestId("onboarding-continue"));

    expect(mockReplace).toHaveBeenCalledWith("/(onboarding)/battery");
    expect(screen.queryByTestId("onboarding-consent-error")).toBeNull();
  });

  it("refreshes the cached profile after a successful consent, so the gate cannot send the driver back here", async () => {
    mockRecordConsent.mockResolvedValue({ ok: true });
    await renderWithGrants();

    await fireEvent.press(screen.getByTestId("onboarding-continue"));

    // The gate routes on the cached profile's consent_version; without this the
    // next pass reads the old version and bounces the driver back to D1.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["auth", "profile"] });
  });

  it("does not refresh the profile when the consent write failed", async () => {
    mockRecordConsent.mockResolvedValue({ ok: false, kind: "network", message: "Failed to fetch" });
    await renderWithGrants();

    await fireEvent.press(screen.getByTestId("onboarding-continue"));

    expect(mockInvalidateQueries).not.toHaveBeenCalled();
  });
});
