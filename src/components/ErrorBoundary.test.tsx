/**
 * Global error boundary (validation report B4). A render crash shows a calm,
 * translated fallback with "Try again" instead of a white screen, reports the
 * error to Sentry, and never shows the raw error text.
 */
import { fireEvent, render } from "@testing-library/react-native";
import { Text } from "react-native";

import "@/i18n";

import en from "@/i18n/en.json";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { reportError } from "@/lib/sentry";

jest.mock("@/lib/sentry", () => ({ reportError: jest.fn() }));

let shouldThrow = true;
function Bomb() {
  if (shouldThrow) {
    throw new Error("render crash near 12.95631, 79.94221");
  }
  return <Text>recovered</Text>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => jest.spyOn(console, "error").mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it("shows the translated fallback, reports the error, and recovers on retry", async () => {
    shouldThrow = true;
    const screen = await render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText(en.common.errorBoundary.title)).toBeTruthy();
    expect(screen.queryByText(/12\.95631/)).toBeNull();
    expect(reportError).toHaveBeenCalledTimes(1);

    shouldThrow = false;
    await fireEvent.press(screen.getByRole("button", { name: en.common.errorBoundary.retry }));
    expect(screen.getByText("recovered")).toBeTruthy();
  });
});
