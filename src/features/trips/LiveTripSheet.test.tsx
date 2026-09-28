/**
 * D5 component tests (docs/12 D5).
 *
 * The screen's job is to say one true thing about each of four states the driver
 * hits in the field — synced, points waiting, offline, GPS lost — plus the two
 * banners that ask them to do something. Those are exactly the states that are
 * hard to reproduce on a device, so they are asserted here.
 *
 * Text queries rather than test-id-plus-matcher: the copy *is* the contract
 * (docs/12 D5 fixes the wording), and a wrong string is the bug this file is
 * meant to catch.
 */
import { fireEvent, render } from "@testing-library/react-native";

// The root layout does this before anything renders; the copy is bundled.
import "@/i18n";

import { LiveTripSheet, type LiveTripSheetProps } from "./LiveTripSheet";

function props(overrides: Partial<LiveTripSheetProps> = {}): LiveTripSheetProps {
  return {
    elapsed: "3h 05m",
    approxKm: 186,
    kmToDrop: 412,
    sync: "synced",
    pendingPoints: 0,
    syncedAgo: null,
    gps: "good",
    gpsAccuracyM: 8,
    problem: null,
    nearDrop: false,
    ending: false,
    onOpenSettings: jest.fn(),
    onEnd: jest.fn(),
    ...overrides,
  };
}

describe("LiveTripSheet — the three stat blocks", () => {
  it("shows elapsed time, approximate distance and distance to the drop", async () => {
    const { getByText } = await render(<LiveTripSheet {...props()} />);

    expect(getByText("3h 05m")).toBeTruthy();
    expect(getByText("186 km")).toBeTruthy();
    expect(getByText("412 km")).toBeTruthy();
    // The distance is a client estimate and must say so (CLAUDE.md rule 1).
    expect(getByText("approx.")).toBeTruthy();
  });

  it("shows a dash for to-drop before the first fix", async () => {
    const { getByText } = await render(<LiveTripSheet {...props({ kmToDrop: null })} />);
    expect(getByText("—")).toBeTruthy();
  });
});

describe("LiveTripSheet — sync states", () => {
  it("says everything is synced, with how long ago", async () => {
    const { getByText } = await render(
      <LiveTripSheet {...props({ sync: "synced", syncedAgo: { unit: "seconds", count: 20 } })} />,
    );
    expect(getByText("All trip data synced · 20 s ago")).toBeTruthy();
  });

  it("says everything is synced when nothing has uploaded yet", async () => {
    const { getByText } = await render(<LiveTripSheet {...props({ sync: "synced" })} />);
    expect(getByText("All trip data synced")).toBeTruthy();
  });

  it("counts the points waiting for the server", async () => {
    const { getByText } = await render(
      <LiveTripSheet {...props({ sync: "pending", pendingPoints: 142 })} />,
    );
    expect(getByText("142 points saved on phone, will upload automatically")).toBeTruthy();
  });

  it("leads with offline, and still counts what is safe on the phone", async () => {
    const { getByText } = await render(
      <LiveTripSheet {...props({ sync: "offline", pendingPoints: 142 })} />,
    );
    expect(
      getByText("Offline · 142 points saved on phone, will upload automatically"),
    ).toBeTruthy();
  });

  it("reassures when offline with nothing left to upload", async () => {
    const { getByText } = await render(
      <LiveTripSheet {...props({ sync: "offline", pendingPoints: 0 })} />,
    );
    expect(getByText("Offline · trip data is saved on your phone")).toBeTruthy();
  });
});

describe("LiveTripSheet — GPS states", () => {
  it("reports a good fix", async () => {
    const { getByText } = await render(<LiveTripSheet {...props({ gps: "good" })} />);
    expect(getByText("GPS good")).toBeTruthy();
  });

  it("shows the accuracy when the fix is weak", async () => {
    const { getByText } = await render(
      <LiveTripSheet {...props({ gps: "weak", gpsAccuracyM: 120 })} />,
    );
    expect(getByText("GPS weak (±120 m)")).toBeTruthy();
  });

  it("waits for a first fix", async () => {
    const { getByText } = await render(
      <LiveTripSheet {...props({ gps: "lost", gpsAccuracyM: null })} />,
    );
    expect(getByText("Waiting for GPS…")).toBeTruthy();
  });
});

describe("LiveTripSheet — tracking problems", () => {
  it("stays quiet while tracking is healthy", async () => {
    const { queryByTestId } = await render(<LiveTripSheet {...props()} />);
    expect(queryByTestId("driver-live-problem-stale")).toBeNull();
    expect(queryByTestId("driver-live-problem-permission")).toBeNull();
  });

  it("warns after two minutes without a point", async () => {
    const { getByTestId, queryByTestId } = await render(
      <LiveTripSheet {...props({ problem: "stale" })} />,
    );
    expect(getByTestId("driver-live-problem-stale")).toBeTruthy();
    expect(queryByTestId("driver-live-problem-permission")).toBeNull();
  });

  it("offers a way out when the permission was revoked", async () => {
    const onOpenSettings = jest.fn();
    const { getByTestId, getByText } = await render(
      <LiveTripSheet {...props({ problem: "permission", onOpenSettings })} />,
    );

    expect(getByTestId("driver-live-problem-permission")).toBeTruthy();
    fireEvent.press(getByText("Open settings"));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});

describe("LiveTripSheet — near the drop and ending", () => {
  it("highlights the delivery area and keeps the END button", async () => {
    const onEnd = jest.fn();
    const { getByTestId, getByText, queryByTestId } = await render(
      <LiveTripSheet {...props({ nearDrop: true, onEnd })} />,
    );

    expect(getByTestId("driver-live-near-drop")).toBeTruthy();
    expect(getByText("You've reached the delivery area")).toBeTruthy();
    fireEvent.press(getByTestId("driver-live-end"));
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(queryByTestId("driver-live-end-error")).toBeNull();
  });

  it("shows no delivery banner while still on the road", async () => {
    const { queryByTestId } = await render(<LiveTripSheet {...props({ nearDrop: false })} />);
    expect(queryByTestId("driver-live-near-drop")).toBeNull();
  });

  it("surfaces a failed end instead of pretending the trip stopped", async () => {
    const { getByText } = await render(
      <LiveTripSheet {...props({ endError: "Network request failed" })} />,
    );
    expect(getByText("Network request failed")).toBeTruthy();
  });

  it("tells the driver that leaving the screen does not stop tracking", async () => {
    const { getByText } = await render(<LiveTripSheet {...props()} />);
    expect(getByText("Tracking continues if you leave this screen.")).toBeTruthy();
  });
});
