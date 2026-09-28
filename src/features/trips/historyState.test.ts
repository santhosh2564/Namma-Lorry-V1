/**
 * D7 history rule tests (M11, docs/12 D7).
 *
 * The month a trip is filed under is the month it *ended* — a trip that runs
 * past midnight belongs to the day the driver finished, and the filter must not
 * change the summary strip above it.
 */
import {
  groupByMonth,
  historySummary,
  isHistoryRow,
  matchesFilter,
  monthKeyOf,
  sortHistory,
  type HistoryRow,
} from "./historyState";

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

describe("isHistoryRow", () => {
  it("excludes trips that have not started — those are on D3", () => {
    expect(isHistoryRow("assigned")).toBe(false);
    expect(isHistoryRow("in_progress")).toBe(true);
    expect(isHistoryRow("verified")).toBe(true);
  });
});

describe("matchesFilter", () => {
  it("shows every status under All, except assigned", () => {
    expect(matchesFilter("verified", "all")).toBe(true);
    expect(matchesFilter("needs_review", "all")).toBe(true);
    expect(matchesFilter("rejected", "all")).toBe(true);
    expect(matchesFilter("assigned", "all")).toBe(false);
  });

  it("matches each status filter exactly", () => {
    expect(matchesFilter("verified", "verified")).toBe(true);
    expect(matchesFilter("needs_review", "needs_review")).toBe(true);
    expect(matchesFilter("rejected", "rejected")).toBe(true);
    expect(matchesFilter("verified", "rejected")).toBe(false);
  });
});

describe("monthKeyOf", () => {
  it("reads the year and month, and null when there is no date", () => {
    expect(monthKeyOf("2026-09-26T15:52:00.000Z")).not.toBeNull();
    expect(monthKeyOf(null)).toBeNull();
    expect(monthKeyOf("nonsense")).toBeNull();
  });
});

describe("sortHistory", () => {
  it("is newest first", () => {
    const rows = [
      row({ id: "old", endedAt: "2026-08-02T10:00:00.000Z" }),
      row({ id: "new", endedAt: "2026-09-26T15:52:00.000Z" }),
    ];
    expect(sortHistory(rows).map((item) => item.id)).toEqual(["new", "old"]);
  });

  it("puts a trip with no dates at the end rather than throwing", () => {
    const rows = [
      row({ id: "undated", startedAt: null, endedAt: null }),
      row({ id: "dated", endedAt: "2026-09-26T15:52:00.000Z" }),
    ];
    expect(sortHistory(rows).map((item) => item.id)).toEqual(["dated", "undated"]);
  });
});

describe("groupByMonth", () => {
  it("groups by the month the trip ended, newest first", () => {
    const months = groupByMonth(
      [
        row({ id: "a", endedAt: "2026-09-26T15:52:00.000Z" }),
        row({ id: "b", endedAt: "2026-08-14T10:00:00.000Z" }),
        row({ id: "c", endedAt: "2026-09-02T10:00:00.000Z" }),
      ],
      "all",
    );

    expect(months.map((month) => month.key)).toEqual(["2026-09", "2026-08"]);
    expect(months[0]?.rows.map((item) => item.id)).toEqual(["a", "c"]);
    expect(months[0]?.label).toBe("September 2026");
  });

  it("files a trip that crosses midnight under the month it ended in", () => {
    const months = groupByMonth(
      [
        row({
          id: "a",
          startedAt: "2026-08-31T22:00:00.000Z",
          endedAt: "2026-09-01T02:00:00.000Z",
        }),
      ],
      "all",
    );
    expect(months.map((month) => month.key)).toEqual(["2026-09"]);
  });

  it("applies the filter to the grouping", () => {
    const months = groupByMonth(
      [
        row({ id: "a", status: "verified" }),
        row({ id: "b", status: "needs_review", endedAt: "2026-09-03T10:00:00.000Z" }),
      ],
      "verified",
    );
    expect(months[0]?.rows.map((item) => item.id)).toEqual(["a"]);
  });

  it("keeps undated rows in their own section instead of dropping them", () => {
    const months = groupByMonth([row({ id: "a", startedAt: null, endedAt: null })], "all");
    expect(months.map((month) => month.key)).toEqual(["undated"]);
  });
});

describe("historySummary", () => {
  it("counts the record, independent of the open filter", () => {
    const summary = historySummary([
      row({ id: "a", status: "verified" }),
      row({ id: "b", status: "verified" }),
      row({ id: "c", status: "needs_review" }),
      row({ id: "d", status: "rejected" }),
      row({ id: "e", status: "assigned" }),
    ]);
    expect(summary).toEqual({ verified: 2, needsReview: 1, rejected: 1 });
  });
});
