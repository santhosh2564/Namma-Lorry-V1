/**
 * D1 Continue must not pass a failed consent write (validation report B3c).
 * D1 also states the retention period and links the privacy policy (docs/09
 * §1), and a build behind the server's policy version is told to update.
 *
 * `recordConsent()` reports failure by *returning* `{ ok: false }`, not by
 * throwing, so a screen that only catches exceptions lets a driver whose
 * consent was never stored walk on into tracking (docs/09 §1).
 *
 * Lives outside `app/` for the reason given in `src/features/auth/splash.test.tsx`.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import * as Linking from "expo-linking";

import "@/i18n";

import PermissionsScreen from "../../../app/(onboarding)/permissions";
import { recordConsent } from "@/features/onboarding/consent";

const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  Stack: { Screen: () => null },
}));

jest.mock("expo-linking", () => ({ openSettings: jest.fn(), openURL: jest.fn() }));

let mockPrivacyPolicyUrl = "";

jest.mock("@/lib/config", () => ({
  config: {
    get privacyPolicyUrl() {
      return mockPrivacyPolicyUrl;
    },
  },
}));

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

let queryClient: QueryClient;

async function renderWithGrants(): Promise<void> {
  await render(
    <QueryClientProvider client={queryClient}>
      <PermissionsScreen />
    </QueryClientProvider>,
  );
  // The first permission read resolves after mount.
  await act(async () => {});
}

beforeEach(() => {
  mockReplace.mockClear();
  mockRecordConsent.mockReset();
  mockPrivacyPolicyUrl = "";
  queryClient = new QueryClient();
  (Linking.openURL as jest.Mock).mockClear();
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

  it("refreshes the profile once the consent is stored, so the gate sees the new version", async () => {
    mockRecordConsent.mockResolvedValue({ ok: true });
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");
    await renderWithGrants();

    await fireEvent.press(screen.getByTestId("onboarding-continue"));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["auth", "profile"] });
  });

  it("tells a driver on an outdated build to update the app instead of retrying", async () => {
    mockRecordConsent.mockResolvedValue({
      ok: false,
      kind: "outdated",
      message: "CONSENT_VERSION_OUTDATED",
    });
    await renderWithGrants();

    await fireEvent.press(screen.getByTestId("onboarding-continue"));

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByTestId("onboarding-consent-outdated")).toBeTruthy();
    expect(screen.queryByTestId("onboarding-consent-error")).toBeNull();
  });
});

describe("D1 notice", () => {
  it("states how long trip GPS is kept", async () => {
    await renderWithGrants();
    expect(screen.getByText(/12 months/)).toBeTruthy();
  });

  it("hides the privacy-policy link while no URL is configured", async () => {
    await renderWithGrants();
    expect(screen.queryByTestId("onboarding-privacy-policy")).toBeNull();
  });

  it("links the privacy policy when EXPO_PUBLIC_PRIVACY_POLICY_URL is set", async () => {
    mockPrivacyPolicyUrl = "https://nammalorry.example/privacy";
    await renderWithGrants();

    await fireEvent.press(screen.getByTestId("onboarding-privacy-policy"));

    expect(Linking.openURL).toHaveBeenCalledWith("https://nammalorry.example/privacy");
  });
});
