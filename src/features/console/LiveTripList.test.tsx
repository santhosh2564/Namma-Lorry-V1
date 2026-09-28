/**
 * C1 component tests (M11, docs/12 C1).
 *
 * The board's job is to make a quiet truck obvious, and the copy is the
 * contract: a stale row must say so in words as well as colour (DESIGN.md: never
 * colour alone), because this is the screen a dispatcher reads at 07:00 on a
 * wall display.
 *
 * Both `render` and `fireEvent` are async in RNTL 14. An un-awaited
 * `fireEvent` leaves its act() scope open and every later query in the file
 * fails with "overlapping act() calls", so both are awaited.
 */
import { fireEvent, render } from "@testing-library/react-native";

import "@/i18n";

import { LiveKpiStrip } from "./LiveKpiStrip";
import { kpiStrip, type LiveTrip } from "./liveState";
import { LiveTripList } from "./LiveTripList";

const NOW = Date.parse("2026-09-28T06:00:00.000Z");

function live(overrides: Partial<LiveTrip> & { tripId: string }): LiveTrip {
  return {
    driverId: "driver-1",
    driverName: "Murugan S",
    vehicleNo: "TN 23 BK 4521",
    loadCode: "NL-2026-000142",
    pickupAddress: "Sriperumbudur",
    dropAddress: "Coimbatore",
    position: { lat: 11.02, lng: 77.1 },
    heading: 275,
    speedMps: 15,
    accuracyM: 8,
    recordedAt: new Date(NOW - 40_000).toISOString(),
    pickup: { lat: 12.97, lng: 79.94 },
    drop: { lat: 11.02, lng: 76.96 },
    dropRadiusM: 500,
    ...overrides,
  };
}

type ListProps = React.ComponentProps<typeof LiveTripList>;

function listProps(overrides: Partial<ListProps> = {}): ListProps {
  return {
    trips: [] as LiveTrip[],
    nowMs: NOW,
    onSelect: jest.fn(),
    selectedTripId: null,
    ...overrides,
  };
}

describe("LiveKpiStrip", () => {
  it("shows live, stale, assigned today and need review", async () => {
    const kpis = kpiStrip({
      trips: [
        live({ tripId: "a" }),
        live({ tripId: "b", recordedAt: new Date(NOW - 20 * 60_000).toISOString() }),
      ],
      nowMs: NOW,
      assignedToday: 12,
      needsReview: 3,
    });

    const { getByTestId, getByText } = await render(<LiveKpiStrip kpis={kpis} />);

    expect(getByTestId("live-kpi-live")).toBeTruthy();
    expect(getByTestId("live-kpi-stale")).toBeTruthy();
    expect(getByText("12")).toBeTruthy();
    expect(getByText("3")).toBeTruthy();
    expect(getByText("need review")).toBeTruthy();
  });

  it("shows zeros when nothing is on the road", async () => {
    const kpis = kpiStrip({ trips: [], nowMs: NOW, assignedToday: 0, needsReview: 0 });
    const { getAllByText, getByTestId } = await render(<LiveKpiStrip kpis={kpis} />);
    expect(getByTestId("live-kpi-live")).toBeTruthy();
    expect(getAllByText("0")).toHaveLength(4);
  });
});

describe("LiveTripList — fresh trucks", () => {
  it("shows the vehicle, driver, load and route", async () => {
    const { getByText } = await render(
      <LiveTripList {...listProps({ trips: [live({ tripId: "a" })] })} />,
    );

    expect(getByText("TN 23 BK 4521")).toBeTruthy();
    expect(getByText("Murugan S")).toBeTruthy();
    expect(getByText("NL-2026-000142")).toBeTruthy();
    expect(getByText("Sriperumbudur → Coimbatore")).toBeTruthy();
  });

  it("says how long ago the truck reported, and the speed", async () => {
    const { getByTestId } = await render(
      <LiveTripList {...listProps({ trips: [live({ tripId: "a" })] })} />,
    );

    expect(getByTestId("live-age")).toHaveTextContent(/^Updated 40 s ago$/);
    expect(getByTestId("live-speed")).toHaveTextContent(/^54 km\/h$/);
  });

  it("opens the trip when a row is pressed", async () => {
    const onSelect = jest.fn();
    const { getByTestId } = await render(
      <LiveTripList {...listProps({ trips: [live({ tripId: "a" })], onSelect })} />,
    );

    await fireEvent.press(getByTestId("live-trip-a"));
    expect(onSelect).toHaveBeenCalledWith("a");
  });
});

describe("LiveTripList — stale trucks", () => {
  it("says there is no recent data rather than showing a bare age", async () => {
    const { getByTestId } = await render(
      <LiveTripList
        {...listProps({
          trips: [live({ tripId: "a", recordedAt: new Date(NOW - 18 * 60_000).toISOString() })],
        })}
      />,
    );

    expect(getByTestId("live-age")).toHaveTextContent(/^No recent data · 18 min ago$/);
  });

  it("orders a fresh truck above a stale one", async () => {
    const { getAllByTestId } = await render(
      <LiveTripList
        {...listProps({
          trips: [
            live({ tripId: "stale", recordedAt: new Date(NOW - 30 * 60_000).toISOString() }),
            live({ tripId: "fresh" }),
          ],
        })}
      />,
    );

    const rows = getAllByTestId(/^live-trip-(fresh|stale)$/);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.props.testID).toBe("live-trip-fresh");
    expect(rows[1]?.props.testID).toBe("live-trip-stale");
  });

  it("treats a row with no timestamp as stale rather than fresh", async () => {
    const { getByTestId } = await render(
      <LiveTripList {...listProps({ trips: [live({ tripId: "a", recordedAt: "not-a-date" })] })} />,
    );

    expect(getByTestId("live-age")).toHaveTextContent(/No recent data/);
  });
});

describe("LiveTripList — empty", () => {
  it("says no lorries are on the road, and still counts zero", async () => {
    const { getByTestId, getByText } = await render(<LiveTripList {...listProps()} />);

    expect(getByTestId("live-empty")).toBeTruthy();
    expect(getByText("No lorries on the road")).toBeTruthy();
    expect(getByText("Active trips (0)")).toBeTruthy();
  });
});
