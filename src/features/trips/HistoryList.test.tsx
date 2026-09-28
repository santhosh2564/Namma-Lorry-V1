/**
 * D7 component tests (M11, docs/12 D7).
 *
 * Two promises this screen makes to a driver: the history is filed under the
 * month the trip *ended*, and a row opens the same result screen they saw when
 * they tapped End. The summary strip counts the whole record, not the open
 * filter — a count that changed when you tapped a chip would be a lie.
 *
 * `render` and `fireEvent` are both async in RNTL 14 and both are awaited; an
 * un-awaited call leaves its act() scope open and every later query in the file
 * fails with "overlapping act() calls".
 */
import { fireEvent, render } from "@testing-library/react-native";

import "@/i18n";

import { HistoryFilters, HistoryList } from "./HistoryList";
import type { HistoryRow } from "./historyState";

function row(overrides: Partial<HistoryRow> & { id: string }): HistoryRow {
  return {
    loadCode: "NL-2026-000142",
    pickupAddress: "Sriperumbudur",
    dropAddress: "Coimbatore",
    status: "verified",
    startedAt: "2026-09-26T06:10:00.000Z",
    endedAt: "2026-09-26T15:52:00.000Z",
    trackedDistanceKm: 512,
    ...overrides,
  };
}

describe("HistoryList", () => {
  it("groups rows under the month they ended in", async () => {
    const { getByTestId } = await render(
      <HistoryList
        filter="all"
        onOpen={jest.fn()}
        rows={[
          row({ id: "a", endedAt: "2026-09-26T15:52:00.000Z" }),
          row({ id: "b", endedAt: "2026-08-14T10:00:00.000Z" }),
        ]}
      />,
    );

    expect(getByTestId("history-month-2026-09")).toBeTruthy();
    expect(getByTestId("history-month-2026-08")).toBeTruthy();
    expect(getByTestId("history-row-a")).toBeTruthy();
  });

  it("shows the route, the verified distance and the status", async () => {
    const { getByTestId, getByText } = await render(
      <HistoryList filter="all" onOpen={jest.fn()} rows={[row({ id: "a" })]} />,
    );

    expect(getByText("Sriperumbudur → Coimbatore")).toBeTruthy();
    expect(getByText("512 km")).toBeTruthy();
    expect(getByTestId("status-chip-verified")).toBeTruthy();
  });

  it("shows a dash for a trip that has not been verified yet", async () => {
    const { getByText } = await render(
      <HistoryList
        filter="all"
        onOpen={jest.fn()}
        rows={[row({ id: "a", status: "completed", trackedDistanceKm: null })]}
      />,
    );
    expect(getByText("—")).toBeTruthy();
  });

  it("counts the whole record in the summary strip, not just the open filter", async () => {
    const { getByTestId } = await render(
      <HistoryList
        filter="needs_review"
        onOpen={jest.fn()}
        rows={[row({ id: "a", status: "verified" }), row({ id: "b", status: "needs_review" })]}
      />,
    );

    // One verified, one under review — even though the filter shows only the
    // under-review row.
    expect(getByTestId("history-summary-text")).toHaveTextContent(/^1 verified · 1 under review$/);
  });

  it("opens the trip when a row is pressed", async () => {
    const onOpen = jest.fn();
    const { getByTestId } = await render(
      <HistoryList filter="all" onOpen={onOpen} rows={[row({ id: "a" })]} />,
    );

    await fireEvent.press(getByTestId("history-row-a"));
    expect(onOpen).toHaveBeenCalledWith("a");
  });

  it("says there is nothing yet when the driver has no trips", async () => {
    const { getByTestId, getByText } = await render(
      <HistoryList filter="all" onOpen={jest.fn()} rows={[]} />,
    );

    expect(getByTestId("history-empty")).toBeTruthy();
    expect(getByText("No trips yet")).toBeTruthy();
  });

  it("applies the status filter", async () => {
    const { queryByTestId } = await render(
      <HistoryList
        filter="verified"
        onOpen={jest.fn()}
        rows={[row({ id: "a", status: "verified" }), row({ id: "b", status: "rejected" })]}
      />,
    );

    expect(queryByTestId("history-row-a")).toBeTruthy();
    expect(queryByTestId("history-row-b")).toBeNull();
  });
});

describe("HistoryFilters", () => {
  it("changes the filter when a chip is pressed", async () => {
    const onChange = jest.fn();
    const { getByTestId } = await render(<HistoryFilters filter="all" onChange={onChange} />);

    await fireEvent.press(getByTestId("history-filter-verified"));
    expect(onChange).toHaveBeenCalledWith("verified");
  });
});
