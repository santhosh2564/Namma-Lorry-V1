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

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  Stack: { Screen: () => null },
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
});
