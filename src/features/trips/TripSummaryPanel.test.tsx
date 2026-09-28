/**
 * D6 component tests (docs/12 D6).
 *
 * Five variants, and the driver only ever sees one of them — so each has to be
 * asserted on its own. The reason list matters most: those strings come straight
 * from docs/08 §3's "driver-facing text" column, and the awkward part (the
 * distance the verifier measured) only appears for the two geofence codes.
 */
import { fireEvent, render } from "@testing-library/react-native";

// The root layout does this before anything renders; the copy is bundled.
import "@/i18n";

import { TripSummaryPanel, type TripSummaryPanelProps } from "./TripSummaryPanel";

const TOTALS = { verifiedTrips: 38, verifiedKm: 14860 };

function props(overrides: Partial<TripSummaryPanelProps> = {}): TripSummaryPanelProps {
  return {
    variant: "verified",
    loadCode: "NL-2026-000142",
    route: "Sriperumbudur SIPCOT → Coimbatore Kurichi",
    dateLabel: "26 Sep 2026",
    trackedKm: 512,
    durationLabel: "9h 42m",
    reasonCodes: [],
    metrics: { endDistanceM: null, startDistanceM: null, plannedRatio: null },
    totals: TOTALS,
    onBack: jest.fn(),
    ...overrides,
  };
}

describe("TripSummaryPanel — verified", () => {
  it("celebrates the verified kilometres and the route", async () => {
    const { getByText, getByTestId } = await render(<TripSummaryPanel {...props()} />);

    expect(getByTestId("trip-summary-verified")).toBeTruthy();
    expect(getByText("Trip verified")).toBeTruthy();
    expect(getByText("Added to your verified experience")).toBeTruthy();
    expect(getByText("512 km")).toBeTruthy();
    expect(getByText("9h 42m")).toBeTruthy();
    expect(getByText("NL-2026-000142")).toBeTruthy();
    expect(getByText("Sriperumbudur SIPCOT → Coimbatore Kurichi")).toBeTruthy();
    expect(getByText("26 Sep 2026")).toBeTruthy();
  });

  it("shows the driver's official totals, grouped", async () => {
    const { getByText } = await render(<TripSummaryPanel {...props()} />);
    expect(getByText("Your total: 38 verified trips · 14,860 km")).toBeTruthy();
  });

  it("explains itself instead of showing zeroes for a driver with no record", async () => {
    const { getByText } = await render(<TripSummaryPanel {...props({ totals: null })} />);
    expect(
      getByText("Your verified experience appears here after your first verified trip."),
    ).toBeTruthy();
  });

  it("goes back to My Trips", async () => {
    const onBack = jest.fn();
    const { getByTestId } = await render(<TripSummaryPanel {...props({ onBack })} />);
    fireEvent.press(getByTestId("trip-summary-back"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe("TripSummaryPanel — needs review", () => {
  it("lists the reasons in plain language, with the measured distance", async () => {
    const { getByText, getByTestId, queryByTestId } = await render(
      <TripSummaryPanel
        {...props({
          variant: "needs_review",
          reasonCodes: ["END_OUTSIDE_DROP", "TRACKING_GAP"],
          metrics: { endDistanceM: 1800, startDistanceM: null, plannedRatio: 0.61 },
        })}
      />,
    );

    expect(getByTestId("trip-summary-needs_review")).toBeTruthy();
    expect(getByText("Trip under review")).toBeTruthy();
    expect(getByText("Namma Lorry will check this. You don't need to do anything.")).toBeTruthy();
    expect(getByText("Trip didn't end at the delivery location")).toBeTruthy();
    expect(getByText("1.8 km away")).toBeTruthy();
    expect(getByText("Tracking stopped for a long time")).toBeTruthy();
    // A reason the verifier does not measure carries no distance row.
    expect(queryByTestId("trip-summary-reason-TRACKING_GAP")).toBeTruthy();
    expect(getByTestId("trip-summary-reasons")).toBeTruthy();
  });

  it("never prints a raw reason code", async () => {
    const { getByText, queryByText } = await render(
      <TripSummaryPanel {...props({ variant: "needs_review", reasonCodes: ["PHASE_TWO_CODE"] })} />,
    );

    expect(queryByText("PHASE_TWO_CODE")).toBeNull();
    expect(getByText("Something about this trip needs a closer look")).toBeTruthy();
  });

  it("shows no reason card for a clean trip", async () => {
    const { queryByTestId } = await render(<TripSummaryPanel {...props()} />);
    expect(queryByTestId("trip-summary-reasons")).toBeNull();
  });
});

describe("TripSummaryPanel — still checking", () => {
  it("spins while the server verifies", async () => {
    const { getByText, getByTestId } = await render(
      <TripSummaryPanel
        {...props({ variant: "verifying", trackedKm: null, durationLabel: null })}
      />,
    );

    expect(getByText("Checking your trip…")).toBeTruthy();
    expect(getByText("We're still receiving your trip data.")).toBeTruthy();
    expect(getByTestId("trip-summary-progress")).toBeTruthy();
  });

  it("explains an offline end rather than looking stuck", async () => {
    const { getByText, getByTestId } = await render(
      <TripSummaryPanel {...props({ variant: "pending_sync", trackedKm: null })} />,
    );

    expect(getByTestId("trip-summary-pending_sync")).toBeTruthy();
    expect(getByText("Ended offline — will verify when you're online.")).toBeTruthy();
  });

  it("has no verified distance to show yet", async () => {
    const { getByText } = await render(
      <TripSummaryPanel {...props({ variant: "verifying", trackedKm: null })} />,
    );
    expect(getByText("Distance")).toBeTruthy();
    expect(getByText("—")).toBeTruthy();
  });
});

describe("TripSummaryPanel — not counted", () => {
  it("renders the rejected story", async () => {
    const { getByText, getByTestId } = await render(
      <TripSummaryPanel {...props({ variant: "rejected", reasonCodes: ["MOCK_LOCATION"] })} />,
    );

    expect(getByTestId("trip-summary-rejected")).toBeTruthy();
    expect(getByText("Trip not verified")).toBeTruthy();
    expect(getByText("Fake GPS app detected")).toBeTruthy();
  });

  it("renders the cancelled story", async () => {
    const { getByText, getByTestId } = await render(
      <TripSummaryPanel {...props({ variant: "cancelled" })} />,
    );

    expect(getByTestId("trip-summary-cancelled")).toBeTruthy();
    expect(getByText("Trip cancelled")).toBeTruthy();
  });
});
